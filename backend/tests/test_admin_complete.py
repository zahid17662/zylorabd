"""Admin API completeness: access control, stats, product lifecycle, order lifecycle rules."""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from conftest import auth_headers, checkout_body

from app.models import (
    AuthProvider, DeliveryZone, Order, OrderStatus, PaymentMethod, PaymentStatus, Role, Transaction, TxStatus,
)
from app.core.config import settings
from app.services import storage

API = "/api/v1/admin"
FAKE_ID = "00000000-0000-0000-0000-000000000001"

ADMIN_ROUTES = [
    ("GET", "/stats", None),
    ("GET", "/dashboard", None),
    ("GET", "/products", None),
    ("POST", "/products", {"title": "x", "category": "c", "base_price": "1"}),
    ("PUT", f"/products/{FAKE_ID}", {"title": "x", "category": "c", "base_price": "1"}),
    ("PATCH", f"/products/{FAKE_ID}", {"title": "x"}),
    ("PATCH", f"/products/{FAKE_ID}/stock", [{"size": "M", "stock_quantity": 1}]),
    ("DELETE", f"/products/{FAKE_ID}", None),
    ("POST", "/media/presigned-url", {"content_type": "image/webp", "size_bytes": 10}),
    ("POST", "/media/presign", {"content_type": "image/webp", "size_bytes": 10}),
    ("GET", "/orders", None),
    ("GET", f"/orders/{FAKE_ID}", None),
    ("PATCH", f"/orders/{FAKE_ID}/status", {"status": "confirmed"}),
]


@pytest.mark.parametrize("method,path,body", ADMIN_ROUTES)
async def test_non_admin_gets_403_and_anonymous_gets_401(client, make_user, method, path, body):
    customer = await make_user()
    forbidden = await client.request(method, API + path, json=body, headers=auth_headers(customer))
    assert forbidden.status_code == 403, f"{method} {path}"
    anonymous = await client.request(method, API + path, json=body)
    assert anonymous.status_code == 401, f"{method} {path}"


async def _stock(client, admin_headers, product_id) -> dict[str, int]:
    rows = (await client.get(f"{API}/products", headers=admin_headers)).json()
    product = next(p for p in rows if p["id"] == str(product_id))
    return {v["size"]: v["stock_quantity"] for v in product["variants"]}


async def _place_cod(client, customer, variant_id, qty=1, **extra) -> dict:
    r = await client.post("/api/v1/orders/checkout", json=checkout_body(variant_id, qty, **extra), headers=auth_headers(customer))
    assert r.status_code in (200, 201), r.text
    return r.json()["order"]


async def _set_status(client, headers, order_id, status):
    return await client.patch(f"{API}/orders/{order_id}/status", json={"status": status}, headers=headers)


async def test_cancel_restores_exact_stock_once(client, make_user, make_product):
    admin, customer = await make_user(Role.admin), await make_user()
    h = auth_headers(admin)
    product = await make_product({"M": 5, "L": 4})
    m_variant = next(v for v in product.variants if v.size == "M")

    order = await _place_cod(client, customer, m_variant.id, qty=3)
    assert (await _stock(client, h, product.id))["M"] == 2

    cancelled = await _set_status(client, h, order["id"], "cancelled")
    assert cancelled.status_code == 200 and cancelled.json()["order_status"] == "cancelled"
    assert await _stock(client, h, product.id) == {"M": 5, "L": 4}

    again = await _set_status(client, h, order["id"], "cancelled")
    assert again.status_code == 409
    assert await _stock(client, h, product.id) == {"M": 5, "L": 4}  # never double-restored


async def test_shipped_order_can_be_cancelled_and_restores_stock(client, make_user, make_product):
    admin, customer = await make_user(Role.admin), await make_user()
    h = auth_headers(admin)
    product = await make_product({"M": 5})
    order = await _place_cod(client, customer, product.variants[0].id, qty=2)
    for nxt in ("shipped", "cancelled"):
        assert (await _set_status(client, h, order["id"], nxt)).status_code == 200
    assert (await _stock(client, h, product.id))["M"] == 5


async def test_cod_delivered_marks_paid_but_cancelled_stays_unpaid(client, make_user, make_product):
    admin, customer = await make_user(Role.admin), await make_user()
    h = auth_headers(admin)
    product = await make_product({"M": 9})
    variant_id = product.variants[0].id

    delivered = await _place_cod(client, customer, variant_id)
    assert delivered["payment_status"] == "unpaid"
    for nxt in ("shipped", "delivered"):
        r = await _set_status(client, h, delivered["id"], nxt)
        assert r.status_code == 200
    assert r.json()["payment_status"] == "paid"

    cancelled = await _place_cod(client, customer, variant_id)
    r = await _set_status(client, h, cancelled["id"], "cancelled")
    assert r.json()["payment_status"] == "unpaid"


async def test_order_detail_includes_customer_items_and_transactions(client, make_user, make_product, sessions):
    admin, customer = await make_user(Role.admin), await make_user()
    h = auth_headers(admin)
    product = await make_product({"M": 5})
    order = await _place_cod(client, customer, product.variants[0].id, qty=2)
    async with sessions() as s:
        s.add(Transaction(
            order_id=uuid.UUID(order["id"]), gateway_tx_id=f"TX-{uuid.uuid4().hex[:8]}", amount=Decimal("100"),
            provider="bkash", status=TxStatus.success, paid_at=datetime.now(timezone.utc),
        ))
        await s.commit()

    r = await client.get(f"{API}/orders/{order['id']}", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["order_number"] == order["order_number"]
    assert body["customer_name"] == customer.name and body["customer_phone"] == customer.phone
    assert body["items"][0]["size"] == "M" and body["items"][0]["quantity"] == 2
    assert body["transactions"][0]["provider"] == "bkash" and body["transactions"][0]["gateway_tx_id"].startswith("TX-")
    assert body["shipping_address"]

    assert (await client.get(f"{API}/orders/{FAKE_ID}", headers=h)).status_code == 404


async def test_order_list_search_and_date_filters(client, make_user, make_product):
    admin, customer = await make_user(Role.admin), await make_user()
    h = auth_headers(admin)
    product = await make_product({"M": 5})
    order = await _place_cod(client, customer, product.variants[0].id)

    by_number = await client.get(f"{API}/orders?q={order['order_number']}", headers=h)
    assert by_number.json()["total"] == 1
    by_phone = await client.get(f"{API}/orders?q=01712345678&order_status=confirmed", headers=h)
    assert by_phone.json()["total"] >= 1
    today = datetime.now(timezone(timedelta(hours=6))).date().isoformat()  # the API filters on Dhaka days
    assert (await client.get(f"{API}/orders?date_from={today}&date_to={today}&q={order['order_number']}", headers=h)).json()["total"] == 1
    assert (await client.get(f"{API}/orders?date_to=2000-01-01&q={order['order_number']}", headers=h)).json()["total"] == 0


async def test_stats_aggregates_status_revenue_splits_and_low_stock(client, make_user, make_product, sessions):
    admin, customer = await make_user(Role.admin), await make_user()
    h = auth_headers(admin)
    before = (await client.get(f"{API}/stats", headers=h)).json()
    product = await make_product({"S": 3, "M": 20})
    m_id = next(v.id for v in product.variants if v.size == "M")

    delivered = await _place_cod(client, customer, m_id, attribution={"utm_source": "fb_ad"})
    for nxt in ("shipped", "delivered"):
        await _set_status(client, h, delivered["id"], nxt)
    cancelled = await _place_cod(client, customer, m_id)
    await _set_status(client, h, cancelled["id"], "cancelled")
    await _place_cod(client, customer, m_id)  # stays confirmed + unpaid

    async with sessions() as s:  # an online order paid through Nagad
        o = Order(
            order_number=f"T{uuid.uuid4().hex[:8]}".upper(), user_id=customer.id, subtotal=Decimal("500"),
            shipping_fee=Decimal("70"), total_amount=Decimal("570"), payment_method=PaymentMethod.online,
            payment_status=PaymentStatus.paid, order_status=OrderStatus.confirmed, login_method=AuthProvider.facebook,
            recipient_name="N", shipping_phone="01712345678", shipping_address="Somewhere 123",
            delivery_zone=DeliveryZone.inside_dhaka,
        )
        s.add(o)
        await s.flush()
        s.add(Transaction(order_id=o.id, gateway_tx_id=f"TX-{uuid.uuid4().hex[:8]}", amount=Decimal("570"),
                          provider="nagad", status=TxStatus.success))
        await s.commit()

    r = await client.get(f"{API}/stats", headers=h)
    assert r.status_code == 200, r.text
    now = r.json()

    def delta(key):
        return now[key] - before[key]

    assert delta("total_orders") == 4
    assert delta("cancelled_orders") == 1 and delta("delivered_orders") == 1
    assert delta("confirmed_orders") == 2  # the unpaid COD one + the Nagad one
    assert Decimal(now["total_revenue"]) - Decimal(before["total_revenue"]) == Decimal(delivered["total_amount"]) + Decimal("570")

    def row(split, key):
        return next((x for x in split if x["key"] == key), {"orders": 0, "revenue": "0"})

    pay_now, pay_before = now["payment_method_split"], before["payment_method_split"]
    assert {x["key"] for x in pay_now} >= {"COD", "BKASH", "NAGAD", "CARD"}
    assert row(pay_now, "COD")["orders"] - row(pay_before, "COD")["orders"] == 2  # cancelled one excluded
    assert row(pay_now, "NAGAD")["orders"] - row(pay_before, "NAGAD")["orders"] == 1
    assert Decimal(row(pay_now, "NAGAD")["revenue"]) - Decimal(row(pay_before, "NAGAD")["revenue"]) == Decimal("570")

    attr = now["order_attribution_split"]
    assert {x["key"] for x in attr["login_channel"]} >= {"FACEBOOK", "PHONE", "EMAIL"}
    assert any(x["key"] == "FB_AD" for x in attr["order_source"])
    assert any(x["key"] == "DIRECT" for x in attr["order_source"])

    low = [v for v in now["low_stock_variants"] if v["product_id"] == str(product.id)]
    assert [(v["size"], v["stock_quantity"]) for v in low] == [("S", 3)]
    assert low[0]["product_title"] and low[0]["sku"]


async def test_admin_products_list_has_inactive_and_total_stock(client, make_user, make_product):
    admin = await make_user(Role.admin)
    h = auth_headers(admin)
    product = await make_product({"S": 2, "M": 3})
    await client.patch(f"{API}/products/{product.id}", json={"is_active": False}, headers=h)
    row = next(p for p in (await client.get(f"{API}/products", headers=h)).json() if p["id"] == str(product.id))
    assert row["is_active"] is False and row["total_stock"] == 5


async def test_put_replaces_fields_and_upserts_sizes(client, make_user, make_product):
    admin = await make_user(Role.admin)
    h = auth_headers(admin)
    product = await make_product({"S": 2, "M": 3})
    body = {
        "title": "Renamed", "description": "d", "category": "Men", "base_price": "999.00", "discount_percent": "10",
        "video_url": "https://cdn.example.com/v.webm", "images": ["https://cdn.example.com/1.webp"], "is_active": True,
        "variants": [{"size": "S", "stock_quantity": 9}, {"size": "XXL", "stock_quantity": 4}],
    }
    r = await client.put(f"{API}/products/{product.id}", json=body, headers=h)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["title"] == "Renamed" and out["video_url"].endswith("v.webm") and out["final_price"] == "899.10"
    sizes = {v["size"]: v["stock_quantity"] for v in out["variants"]}
    assert sizes == {"S": 9, "M": 3, "XXL": 4}  # upsert: untouched size M is kept
    assert next(v for v in out["variants"] if v["size"] == "XXL")["sku"]  # auto SKU
    assert (await client.put(f"{API}/products/{FAKE_ID}", json=body, headers=h)).status_code == 404


async def test_delete_hard_deletes_unreferenced_and_archives_ordered_products(client, make_user, make_product):
    admin, customer = await make_user(Role.admin), await make_user()
    h = auth_headers(admin)
    unused = await make_product({"M": 1})
    r = await client.delete(f"{API}/products/{unused.id}", headers=h)
    assert r.status_code == 200 and r.json() == {"result": "deleted"}
    assert all(p["id"] != str(unused.id) for p in (await client.get(f"{API}/products", headers=h)).json())

    ordered = await make_product({"M": 5})
    await _place_cod(client, customer, ordered.variants[0].id)
    r = await client.delete(f"{API}/products/{ordered.id}", headers=h)
    assert r.status_code == 200 and r.json() == {"result": "archived"}
    kept = next(p for p in (await client.get(f"{API}/products", headers=h)).json() if p["id"] == str(ordered.id))
    assert kept["is_active"] is False
    assert (await client.delete(f"{API}/products/{FAKE_ID}", headers=h)).status_code == 404


async def test_presigned_url_endpoint_validates_and_reports_missing_storage(client, make_user, monkeypatch):
    h = auth_headers(await make_user(Role.admin))
    monkeypatch.setattr(storage, "presign_put", lambda ct, size: {"upload_url": "u", "public_url": "p", "headers": {}})
    ok = await client.post(f"{API}/media/presigned-url", json={"content_type": "video/mp4", "size_bytes": 1000}, headers=h)
    assert ok.status_code == 200 and ok.json()["upload_url"] == "u"

    def not_configured(ct, size):
        raise storage.StorageNotConfigured

    monkeypatch.setattr(storage, "presign_put", not_configured)
    assert (await client.post(f"{API}/media/presigned-url", json={"content_type": "video/mp4", "size_bytes": 1}, headers=h)).status_code == 503

    def invalid(ct, size):
        raise storage.InvalidUpload("Allowed types: JPEG, PNG, WebP images; MP4, WebM videos")

    monkeypatch.setattr(storage, "presign_put", invalid)
    bad = await client.post(f"{API}/media/presigned-url", json={"content_type": "application/pdf", "size_bytes": 1}, headers=h)
    assert bad.status_code == 422


async def test_order_list_filters_by_payment_provider(client, make_user, make_product, sessions):
    admin, customer = await make_user(Role.admin), await make_user()
    h = auth_headers(admin)
    product = await make_product({"M": 5})
    order = await _place_cod(client, customer, product.variants[0].id)
    async with sessions() as s:
        s.add(Transaction(order_id=uuid.UUID(order["id"]), gateway_tx_id=f"TX-{uuid.uuid4().hex[:8]}",
                          amount=Decimal("10"), provider="bkash", status=TxStatus.success))
        await s.commit()
    q = f"q={order['order_number']}"
    assert (await client.get(f"{API}/orders?{q}&payment_provider=bkash", headers=h)).json()["total"] == 1
    assert (await client.get(f"{API}/orders?{q}&payment_provider=nagad", headers=h)).json()["total"] == 0
    assert (await client.get(f"{API}/orders?{q}&payment_provider=paypal", headers=h)).status_code == 422


async def test_patch_rejects_explicit_null_for_required_fields(client, make_user, make_product):
    h = auth_headers(await make_user(Role.admin))
    product = await make_product({"M": 1})
    for field in ("title", "category", "base_price", "discount_percent", "images", "is_active", "description"):
        r = await client.patch(f"{API}/products/{product.id}", json={field: None}, headers=h)
        assert r.status_code == 422, f"{field}: {r.status_code}"
    ok = await client.patch(f"{API}/products/{product.id}", json={"video_url": None}, headers=h)
    assert ok.status_code == 200  # the one genuinely nullable field


async def test_duplicate_sizes_in_put_and_patch_are_422(client, make_user, make_product):
    h = auth_headers(await make_user(Role.admin))
    product = await make_product({"M": 1})
    dup = [{"size": "XL", "stock_quantity": 1}, {"size": "XL", "stock_quantity": 2}]
    full = {"title": "t", "category": "c", "base_price": "10", "variants": dup}
    assert (await client.put(f"{API}/products/{product.id}", json=full, headers=h)).status_code == 422
    assert (await client.patch(f"{API}/products/{product.id}", json={"variants": dup}, headers=h)).status_code == 422


async def test_dashboard_revenue_excludes_cancelled_orders_like_stats(client, make_user, sessions):
    admin, customer = await make_user(Role.admin), await make_user()
    h = auth_headers(admin)
    before = (await client.get(f"{API}/dashboard", headers=h)).json()
    async with sessions() as s:
        s.add(Order(
            order_number=f"T{uuid.uuid4().hex[:8]}".upper(), user_id=customer.id, subtotal=Decimal("500"),
            shipping_fee=Decimal("70"), total_amount=Decimal("570"), payment_method=PaymentMethod.online,
            payment_status=PaymentStatus.paid, order_status=OrderStatus.cancelled, login_method=AuthProvider.email,
            recipient_name="N", shipping_phone="01712345678", shipping_address="Somewhere 123",
            delivery_zone=DeliveryZone.inside_dhaka,
        ))
        await s.commit()
    after = (await client.get(f"{API}/dashboard", headers=h)).json()
    assert Decimal(after["total_revenue"]) == Decimal(before["total_revenue"])
    assert Decimal(after["online_revenue"]) == Decimal(before["online_revenue"])


async def test_search_treats_percent_and_underscore_literally(client, make_user, make_product):
    h = auth_headers(await make_user(Role.admin))
    customer = await make_user()
    product = await make_product({"M": 5})
    await _place_cod(client, customer, product.variants[0].id)
    assert (await client.get(f"{API}/orders?q=%25", headers=h)).json()["total"] == 0
    assert (await client.get(f"{API}/orders?q=_", headers=h)).json()["total"] == 0


async def test_cors_preflight_allows_put_for_the_dashboard_origin(client):
    origin = settings.cors_origin_list[0] if hasattr(settings, "cors_origin_list") else settings.cors_origins.split(",")[0].strip()
    r = await client.options(
        f"{API}/products/{FAKE_ID}",
        headers={"Origin": origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "authorization,content-type"},
    )
    assert r.status_code == 200, r.text
    assert "PUT" in r.headers["access-control-allow-methods"]


async def test_stock_delta_adds_atomically_and_never_goes_negative(client, make_user, make_product):
    h = auth_headers(await make_user(Role.admin))
    product = await make_product({"M": 4})
    url = f"{API}/products/{product.id}/stock"
    r = await client.patch(url, json=[{"size": "M", "delta": 6}, {"size": "XL", "delta": 2}], headers=h)
    assert r.status_code == 200, r.text
    assert {v["size"]: v["stock_quantity"] for v in r.json()["variants"]} == {"M": 10, "XL": 2}
    assert (await client.patch(url, json=[{"size": "M", "delta": -3}], headers=h)).json()["variants"][0]["stock_quantity"] == 7
    assert (await client.patch(url, json=[{"size": "M", "delta": -8}], headers=h)).status_code == 422  # would be -1
    assert (await _stock(client, h, product.id))["M"] == 7  # unchanged by the rejected request
    assert (await client.patch(url, json=[{"size": "M", "delta": 1, "stock_quantity": 5}], headers=h)).status_code == 422
    assert (await client.patch(url, json=[{"size": "M"}], headers=h)).status_code == 422
