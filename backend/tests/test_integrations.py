import json
from datetime import timedelta

from conftest import auth_headers, checkout_body
from sqlalchemy import select, update

from app.core.config import settings
from app.core.security import now
from app.main import sweep_expired_orders
from app.models import Order, ProductVariant, Role, Transaction
from app.services import payment


async def place_order(client, make_user, make_product, method="online", stock=4):
    user = await make_user()
    product = await make_product({"M": stock})
    vid = product.variants[0].id
    r = await client.post("/api/v1/orders/checkout", json=checkout_body(vid, method=method), headers=auth_headers(user))
    assert r.status_code == 201, r.text
    return r.json()["order"], vid


async def stock_of(sessions, vid) -> int:
    async with sessions() as s:
        return await s.scalar(select(ProductVariant.stock_quantity).where(ProductVariant.id == vid))


# ---------- 30-minute abandonment sweep ----------
async def test_sweeper_cancels_stale_online_orders_and_releases_stock_once(client, sessions, make_user, make_product):
    stale, vid_stale = await place_order(client, make_user, make_product)
    fresh, vid_fresh = await place_order(client, make_user, make_product)
    cod, vid_cod = await place_order(client, make_user, make_product, method="cod")
    async with sessions() as s:  # age two orders by 31 minutes
        await s.execute(update(Order).where(Order.id.in_([stale["id"], cod["id"]])).values(created_at=now() - timedelta(minutes=31)))
        await s.commit()
    assert await stock_of(sessions, vid_stale) == 3
    async with sessions() as s:
        assert await sweep_expired_orders(s) >= 1
    async with sessions() as s:
        o = await s.scalar(select(Order).where(Order.id == stale["id"]))
        assert o.order_status.value == "cancelled" and o.payment_status.value == "failed" and o.stock_released
    assert await stock_of(sessions, vid_stale) == 4
    assert await stock_of(sessions, vid_fresh) == 3  # still within the 30-minute window
    assert await stock_of(sessions, vid_cod) == 3  # COD orders are never auto-cancelled
    async with sessions() as s:
        await sweep_expired_orders(s)  # running again must not restock twice
    assert await stock_of(sessions, vid_stale) == 4


# ---------- Facebook login ----------
class FakeResp:
    def __init__(self, status, body):
        self.status_code, self._body = status, body

    def json(self):
        return self._body


def fake_facebook(monkeypatch, app_id="APP1", valid=True, user_id="fb-123"):
    class FakeClient:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False

        async def get(self, url, params=None):
            if "debug_token" in url:
                return FakeResp(200, {"data": {"is_valid": valid, "app_id": app_id}})
            return FakeResp(200, {"id": user_id, "name": "FB Buyer"})

    monkeypatch.setattr("app.api.v1.auth.httpx.AsyncClient", FakeClient)


async def test_facebook_login_creates_account(client, monkeypatch):
    monkeypatch.setattr(settings, "facebook_app_id", "APP1")
    monkeypatch.setattr(settings, "facebook_app_secret", "secret")
    fake_facebook(monkeypatch)
    r = await client.post("/api/v1/auth/login", json={"method": "facebook", "facebook_access_token": "tok"})
    assert r.status_code == 200
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.json()["name"] == "FB Buyer"
    again = await client.post("/api/v1/auth/login", json={"method": "facebook", "facebook_access_token": "tok"})
    me2 = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {again.json()['access_token']}"})
    assert me2.json()["id"] == me.json()["id"]  # same Facebook id -> same account


async def test_facebook_token_from_another_app_is_rejected(client, monkeypatch):
    monkeypatch.setattr(settings, "facebook_app_id", "APP1")
    monkeypatch.setattr(settings, "facebook_app_secret", "secret")
    fake_facebook(monkeypatch, app_id="SOMEONE_ELSES_APP")
    r = await client.post("/api/v1/auth/login", json={"method": "facebook", "facebook_access_token": "tok"})
    assert r.status_code == 401


async def test_facebook_not_configured_and_missing_token(client, monkeypatch):
    monkeypatch.setattr(settings, "facebook_app_id", "")
    r = await client.post("/api/v1/auth/login", json={"method": "facebook", "facebook_access_token": "tok"})
    assert r.status_code == 503
    assert (await client.post("/api/v1/auth/login", json={"method": "facebook"})).status_code == 422


# ---------- UddoktaPay webhook mode ----------
def uddokta_mode(monkeypatch):
    monkeypatch.setattr(settings, "payment_gateway_api_key", "gw-key")
    monkeypatch.setattr(settings, "payment_gateway_base_url", "https://sandbox.example.com")


async def tx_of(sessions, order_id):
    async with sessions() as s:
        return await s.scalar(select(Transaction).where(Transaction.order_id == order_id))


async def test_uddoktapay_webhook_trusts_the_gateway_not_the_body(client, sessions, make_user, make_product, monkeypatch):
    order, vid = await place_order(client, make_user, make_product)
    tx = await tx_of(sessions, order["id"])
    uddokta_mode(monkeypatch)

    async def gateway_says(status):
        async def verify(invoice_id):
            return {"metadata": {"tran_id": str(tx.id)}, "amount": order["total_amount"], "status": status,
                    "transaction_id": "TRX9", "invoice_id": invoice_id}
        return verify

    body = json.dumps({"invoice_id": "INV1", "status": "COMPLETED"})  # a forged "paid" body
    wrong_key = await client.post("/api/v1/payments/webhook", content=body, headers={"RT-UDDOKTAPAY-API-KEY": "nope"})
    assert wrong_key.status_code == 401

    monkeypatch.setattr(payment, "verify_uddokta_payment", await gateway_says("PENDING"))
    pending = await client.post("/api/v1/payments/webhook", content=body, headers={"RT-UDDOKTAPAY-API-KEY": "gw-key"})
    assert pending.json() == {"status": "pending"}

    monkeypatch.setattr(payment, "verify_uddokta_payment", await gateway_says("ERROR"))  # gateway says NOT paid
    failed = await client.post("/api/v1/payments/webhook", content=body, headers={"RT-UDDOKTAPAY-API-KEY": "gw-key"})
    assert failed.status_code == 200
    async with sessions() as s:
        assert (await s.scalar(select(Order).where(Order.id == order["id"]))).payment_status.value == "failed"
    assert await stock_of(sessions, vid) == 4


async def test_uddoktapay_success_marks_paid(client, sessions, make_user, make_product, monkeypatch):
    order, _ = await place_order(client, make_user, make_product)
    tx = await tx_of(sessions, order["id"])
    uddokta_mode(monkeypatch)

    async def verify(invoice_id):
        return {"metadata": {"tran_id": str(tx.id)}, "amount": order["total_amount"], "status": "COMPLETED",
                "transaction_id": "TRXOK", "invoice_id": invoice_id}

    monkeypatch.setattr(payment, "verify_uddokta_payment", verify)
    r = await client.post("/api/v1/payments/webhook", content=json.dumps({"invoice_id": "INV2"}),
                          headers={"RT-UDDOKTAPAY-API-KEY": "gw-key"})
    assert r.json() == {"status": "ok"}
    async with sessions() as s:
        o = await s.scalar(select(Order).where(Order.id == order["id"]))
    assert o.payment_status.value == "paid" and o.order_status.value == "confirmed"


async def test_gateway_outage_returns_502_and_changes_nothing(client, sessions, make_user, make_product, monkeypatch):
    order, _ = await place_order(client, make_user, make_product)
    uddokta_mode(monkeypatch)

    async def boom(invoice_id):
        raise payment.GatewayError("down")

    monkeypatch.setattr(payment, "verify_uddokta_payment", boom)
    r = await client.post("/api/v1/payments/webhook", content=json.dumps({"invoice_id": "INV3"}),
                          headers={"RT-UDDOKTAPAY-API-KEY": "gw-key"})
    assert r.status_code == 502
    async with sessions() as s:
        assert (await s.scalar(select(Order).where(Order.id == order["id"]))).payment_status.value == "pending"


async def test_browser_return_redirects_to_storefront_without_changing_state(client):
    r = await client.get("/api/v1/payments/return/success", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].endswith("/checkout/result?outcome=success")
    assert (await client.get("/api/v1/payments/return/bogus", follow_redirects=False)).status_code == 404


# ---------- Media presign ----------
def configure_storage(monkeypatch, on=True):
    vals = {"s3_endpoint_url": "https://acc.r2.cloudflarestorage.com", "r2_access_key_id": "k", "r2_secret_access_key": "s",
            "r2_bucket": "b", "r2_public_base_url": "https://cdn.example.com"} if on else {
        "s3_endpoint_url": "", "r2_account_id": "", "r2_access_key_id": "", "r2_secret_access_key": "", "r2_bucket": "",
        "r2_public_base_url": ""}
    for k, v in vals.items():
        monkeypatch.setattr(settings, k, v)


async def test_presign_returns_signed_put_url_for_allowed_media(client, make_user, monkeypatch):
    configure_storage(monkeypatch)
    h = auth_headers(await make_user(Role.admin))
    r = await client.post("/api/v1/admin/media/presign", json={"content_type": "video/mp4", "size_bytes": 5_000_000}, headers=h)
    assert r.status_code == 200
    d = r.json()
    assert d["upload_url"].startswith("https://acc.r2.cloudflarestorage.com/b/products/") and "X-Amz-Expires=600" in d["upload_url"]
    assert d["public_url"].startswith("https://cdn.example.com/products/") and d["public_url"].endswith(".mp4")
    assert d["headers"]["Content-Type"] == "video/mp4"


async def test_presign_rejects_bad_type_oversize_and_non_admin(client, make_user, monkeypatch):
    configure_storage(monkeypatch)
    h = auth_headers(await make_user(Role.admin))
    assert (await client.post("/api/v1/admin/media/presign", json={"content_type": "application/x-msdownload", "size_bytes": 10}, headers=h)).status_code == 422
    assert (await client.post("/api/v1/admin/media/presign", json={"content_type": "video/mp4", "size_bytes": 99_000_000}, headers=h)).status_code == 422
    assert (await client.post("/api/v1/admin/media/presign", json={"content_type": "image/jpeg", "size_bytes": 10},
                              headers=auth_headers(await make_user()))).status_code == 403


async def test_presign_reports_when_storage_is_not_configured(client, make_user, monkeypatch):
    configure_storage(monkeypatch, on=False)
    h = auth_headers(await make_user(Role.admin))
    r = await client.post("/api/v1/admin/media/presign", json={"content_type": "image/webp", "size_bytes": 10}, headers=h)
    assert r.status_code == 503


# ---------- misc ----------
async def test_logout_revokes_the_refresh_token(client):
    t = (await client.post("/api/v1/auth/register", json={"name": "L", "email": "lo@example.com", "password": "Passw0rd!x"})).json()
    assert (await client.post("/api/v1/auth/logout", json={"refresh_token": t["refresh_token"]})).status_code == 204
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": t["refresh_token"]})).status_code == 401


async def test_admin_cancel_restores_stock_and_product_edit_works(client, sessions, make_user, make_product):
    admin = await make_user(Role.admin)
    order, vid = await place_order(client, make_user, make_product, method="cod", stock=3)
    assert await stock_of(sessions, vid) == 2
    r = await client.patch(f"/api/v1/admin/orders/{order['id']}/status", json={"status": "cancelled"}, headers=auth_headers(admin))
    assert r.status_code == 200
    assert await stock_of(sessions, vid) == 3
    # cancelled is final
    again = await client.patch(f"/api/v1/admin/orders/{order['id']}/status", json={"status": "confirmed"}, headers=auth_headers(admin))
    assert again.status_code == 409

    product = await make_product({"S": 1})
    p = await client.patch(f"/api/v1/admin/products/{product.id}", json={"title": "Renamed", "variants": [{"size": "L", "stock_quantity": 7}]},
                           headers=auth_headers(admin))
    assert p.status_code == 200 and p.json()["title"] == "Renamed"
    assert {v["size"] for v in p.json()["variants"]} == {"S", "L"}


async def test_health_reports_database_status(client):
    r = await client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok", "database": "up"}


async def test_unexpected_errors_return_a_clean_500(client, monkeypatch):
    async def boom():
        raise RuntimeError("secret internals")
        yield  # pragma: no cover

    from httpx import ASGITransport, AsyncClient

    from app.core.database import get_db
    from app.main import app
    app.dependency_overrides[get_db] = boom  # the client fixture clears overrides on teardown
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as c:
        r = await c.get("/api/v1/products")
    assert r.status_code == 500
    assert r.json() == {"detail": "Something went wrong on our side."}  # no stack trace or internals leaked
