from conftest import auth_headers, checkout_body

from app.models import Role


async def test_admin_can_create_product_with_sizes_and_update_stock(client, make_user):
    admin = await make_user(Role.admin)
    h = auth_headers(admin)
    body = {
        "title": "Eid Panjabi", "category": "Men", "base_price": "2000.00", "discount_percent": "10",
        "images": ["https://cdn.example.com/a.jpg"], "video_url": "https://cdn.example.com/v.mp4",
        "variants": [{"size": s, "stock_quantity": 5} for s in ("S", "M", "L", "XL", "XXL")],
    }
    r = await client.post("/api/v1/admin/products", json=body, headers=h)
    assert r.status_code == 201, r.text
    p = r.json()
    assert [v["size"] for v in p["variants"]] == ["S", "M", "L", "XL", "XXL"]
    r = await client.patch(f"/api/v1/admin/products/{p['id']}/stock", json=[{"size": "M", "stock_quantity": 0}], headers=h)
    assert r.status_code == 200
    assert {v["size"]: v["stock_quantity"] for v in r.json()["variants"]}["M"] == 0
    dup = await client.patch(
        f"/api/v1/admin/products/{p['id']}/stock",
        json=[{"size": "M", "stock_quantity": 1}, {"size": "M", "stock_quantity": 2}], headers=h,
    )
    assert dup.status_code == 422


async def test_public_catalog_is_paginated_and_hides_inactive(client, make_user, make_product):
    admin = await make_user(Role.admin)
    product = await make_product({"M": 1})
    listing = await client.get("/api/v1/products?page=1&page_size=5")
    assert listing.status_code == 200
    assert len(listing.json()["items"]) <= 5
    d = await client.delete(f"/api/v1/admin/products/{product.id}", headers=auth_headers(admin))
    assert d.status_code == 204
    assert (await client.get(f"/api/v1/products/{product.id}")).status_code == 404


async def test_admin_order_log_filters_and_status_flow(client, make_user, make_product):
    admin, customer = await make_user(Role.admin), await make_user()
    product = await make_product({"M": 5})
    body = checkout_body(product.variants[0].id, attribution={"utm_source": "tiktok-test"})
    order = (await client.post("/api/v1/orders/checkout", json=body, headers=auth_headers(customer, "facebook"))).json()["order"]
    h = auth_headers(admin)
    r = await client.get("/api/v1/admin/orders?order_source=tiktok-test&login_method=facebook&payment_method=cod", headers=h)
    assert r.status_code == 200 and r.json()["total"] == 1
    row = r.json()["items"][0]
    assert row["order_source"] == "tiktok-test" and row["login_method"] == "facebook"
    assert (await client.get("/api/v1/admin/orders?order_source=nope-nope", headers=h)).json()["total"] == 0

    oid = order["id"]
    bad = await client.patch(f"/api/v1/admin/orders/{oid}/status", json={"status": "delivered"}, headers=h)
    assert bad.status_code == 409  # cannot skip shipping
    for nxt in ("shipped", "delivered"):
        ok = await client.patch(f"/api/v1/admin/orders/{oid}/status", json={"status": nxt}, headers=h)
        assert ok.status_code == 200
    assert ok.json()["payment_status"] == "paid"  # COD cash collected on delivery
