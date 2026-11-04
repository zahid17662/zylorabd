import asyncio

from conftest import auth_headers, checkout_body
from sqlalchemy import func, select

from app.models import Order, OrderItem, ProductVariant


async def stock_of(sessions, variant_id) -> int:
    async with sessions() as s:
        return await s.scalar(select(ProductVariant.stock_quantity).where(ProductVariant.id == variant_id))


async def test_cod_order_is_confirmed_unpaid_and_stock_deducted(client, sessions, make_user, make_product):
    user = await make_user()
    product = await make_product({"M": 5}, price="1000.00", discount="20")
    vid = product.variants[0].id
    r = await client.post("/api/v1/orders/checkout", json=checkout_body(vid, qty=2), headers=auth_headers(user))
    assert r.status_code == 201, r.text
    order = r.json()["order"]
    assert order["order_status"] == "confirmed"
    assert order["payment_status"] == "unpaid"
    assert r.json()["payment_url"] is None
    # 2 x (1000 - 20%) + 70 inside-Dhaka delivery, all computed on the server
    assert order["subtotal"] == "1600.00" and order["shipping_fee"] == "70.00" and order["total_amount"] == "1670.00"
    assert await stock_of(sessions, vid) == 3


async def test_outside_dhaka_uses_higher_delivery_fee(client, make_user, make_product):
    user = await make_user()
    product = await make_product({"M": 5}, price="500.00")
    r = await client.post(
        "/api/v1/orders/checkout", json=checkout_body(product.variants[0].id, zone="outside_dhaka"), headers=auth_headers(user)
    )
    assert r.status_code == 201
    assert r.json()["order"]["shipping_fee"] == "130.00"


async def test_client_supplied_prices_are_ignored(client, make_user, make_product):
    user = await make_user()
    product = await make_product({"M": 5}, price="1000.00")
    body = checkout_body(product.variants[0].id, unit_price="1", total_amount="1", subtotal="1")
    body["items"][0]["price"] = "1"
    r = await client.post("/api/v1/orders/checkout", json=body, headers=auth_headers(user))
    assert r.status_code == 201
    assert r.json()["order"]["total_amount"] == "1070.00"


async def test_checkout_requires_login(client, make_product):
    product = await make_product()
    r = await client.post("/api/v1/orders/checkout", json=checkout_body(product.variants[0].id))
    assert r.status_code == 401


async def test_out_of_stock_is_rejected_with_400(client, sessions, make_user, make_product):
    user = await make_user()
    product = await make_product({"L": 1})
    vid = product.variants[0].id
    r = await client.post("/api/v1/orders/checkout", json=checkout_body(vid, qty=2), headers=auth_headers(user))
    assert r.status_code == 400
    assert "Out of stock" in r.text
    assert await stock_of(sessions, vid) == 1  # nothing deducted


async def test_online_order_awaits_payment_and_returns_payment_url(client, sessions, make_user, make_product):
    user = await make_user()
    product = await make_product({"M": 4})
    vid = product.variants[0].id
    r = await client.post("/api/v1/orders/checkout", json=checkout_body(vid, method="online"), headers=auth_headers(user))
    assert r.status_code == 201
    order = r.json()["order"]
    assert order["order_status"] == "awaiting_payment" and order["payment_status"] == "pending"
    assert r.json()["payment_url"]
    assert await stock_of(sessions, vid) == 3  # reserved while the customer pays


async def test_two_simultaneous_requests_for_the_last_item_cannot_oversell(client, sessions, make_user, make_product):
    product = await make_product({"L": 1})
    vid = product.variants[0].id
    users = [await make_user(), await make_user()]
    results = await asyncio.gather(*[
        client.post("/api/v1/orders/checkout", json=checkout_body(vid), headers=auth_headers(u)) for u in users
    ])
    assert sorted(r.status_code for r in results) == [201, 400]
    assert await stock_of(sessions, vid) == 0
    async with sessions() as s:
        sold = await s.scalar(select(func.coalesce(func.sum(OrderItem.quantity), 0)).where(OrderItem.variant_id == vid))
    assert sold == 1


async def test_many_concurrent_buyers_never_exceed_stock(client, sessions, make_user, make_product):
    product = await make_product({"XL": 3})
    vid = product.variants[0].id
    users = [await make_user() for _ in range(8)]
    results = await asyncio.gather(*[
        client.post("/api/v1/orders/checkout", json=checkout_body(vid), headers=auth_headers(u)) for u in users
    ])
    codes = [r.status_code for r in results]
    assert codes.count(201) == 3 and codes.count(400) == 5, codes
    assert await stock_of(sessions, vid) == 0
    async with sessions() as s:
        n = await s.scalar(select(func.count()).select_from(Order).join(OrderItem).where(OrderItem.variant_id == vid))
    assert n == 3


async def test_utm_source_and_login_channel_are_recorded(client, sessions, make_user, make_product):
    user = await make_user()
    product = await make_product({"M": 5})
    body = checkout_body(product.variants[0].id, attribution={"utm_source": "facebook", "utm_campaign": "eid"})
    r = await client.post("/api/v1/orders/checkout", json=body, headers=auth_headers(user, method="phone"))
    assert r.status_code == 201
    async with sessions() as s:
        order = await s.scalar(select(Order).where(Order.order_number == r.json()["order"]["order_number"]))
    assert order.order_source == "facebook"
    assert order.login_method.value == "phone"
