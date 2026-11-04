from datetime import timedelta

from conftest import auth_headers, rand_phone
from sqlalchemy import select

from app.core import ratelimit
from app.core.security import now, sha256
from app.models import OtpCode, Role
from app.schemas import normalize_phone

PASSWORD = "Passw0rd!x"


async def register(client, email="a@example.com"):
    return await client.post("/api/v1/auth/register", json={"name": "Ana", "email": email, "password": PASSWORD})


async def test_email_register_login_and_me(client):
    r = await register(client, "ana1@example.com")
    assert r.status_code == 201 and r.json()["access_token"] and r.json()["refresh_token"]
    r = await client.post("/api/v1/auth/login", json={"method": "email", "email": "ana1@example.com", "password": PASSWORD})
    assert r.status_code == 200
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.status_code == 200 and me.json()["email"] == "ana1@example.com"
    assert "password" not in me.text


async def test_duplicate_email_and_wrong_password(client):
    await register(client, "dup@example.com")
    assert (await register(client, "dup@example.com")).status_code == 409
    bad = await client.post("/api/v1/auth/login", json={"method": "email", "email": "dup@example.com", "password": "wrong-password"})
    assert bad.status_code == 401
    unknown = await client.post("/api/v1/auth/login", json={"method": "email", "email": "nobody@example.com", "password": PASSWORD})
    assert unknown.status_code == 401 and unknown.json() == bad.json()  # no account enumeration


async def test_short_password_rejected(client):
    r = await client.post("/api/v1/auth/register", json={"name": "A", "email": "s@example.com", "password": "short"})
    assert r.status_code == 422


async def test_protected_routes_need_a_valid_token(client):
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    assert (await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer garbage"})).status_code == 401


async def test_refresh_rotates_and_reuse_kills_the_session(client):
    first = (await register(client, "rot@example.com")).json()
    second = await client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert second.status_code == 200 and second.json()["refresh_token"] != first["refresh_token"]
    replay = await client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert replay.status_code == 401
    # the legitimate newer token is revoked too once reuse is detected
    after = await client.post("/api/v1/auth/refresh", json={"refresh_token": second.json()["refresh_token"]})
    assert after.status_code == 401


async def put_otp(sessions, phone, code, expires_in=timedelta(minutes=5), attempts=0):
    async with sessions() as s:
        s.add(OtpCode(phone=phone, code_hash=sha256(f"{phone}:{code}"), expires_at=now() + expires_in, attempts=attempts))
        await s.commit()


async def test_phone_otp_login_creates_account_and_code_is_single_use(client, sessions):
    phone = normalize_phone(rand_phone())
    await put_otp(sessions, phone, "123456")
    r = await client.post("/api/v1/auth/login", json={"method": "phone", "phone": phone, "otp": "123456", "name": "Karim"})
    assert r.status_code == 200
    reuse = await client.post("/api/v1/auth/login", json={"method": "phone", "phone": phone, "otp": "123456"})
    assert reuse.status_code == 401


async def test_expired_otp_is_rejected(client, sessions):
    phone = normalize_phone(rand_phone())
    await put_otp(sessions, phone, "654321", expires_in=timedelta(minutes=-1))
    r = await client.post("/api/v1/auth/login", json={"method": "phone", "phone": phone, "otp": "654321"})
    assert r.status_code == 401


async def test_wrong_otp_attempts_lock_the_code(client, sessions):
    phone = normalize_phone(rand_phone())
    await put_otp(sessions, phone, "111111")
    for _ in range(5):
        bad = await client.post("/api/v1/auth/login", json={"method": "phone", "phone": phone, "otp": "000000"})
        assert bad.status_code == 401
    right = await client.post("/api/v1/auth/login", json={"method": "phone", "phone": phone, "otp": "111111"})
    assert right.status_code == 401  # brute force protection: the real code no longer works


async def test_otp_resend_has_a_cooldown(client):
    phone = rand_phone()
    assert (await client.post("/api/v1/auth/otp/request", json={"phone": phone})).status_code == 202
    assert (await client.post("/api/v1/auth/otp/request", json={"phone": phone})).status_code == 429


async def test_invalid_bd_phone_rejected(client):
    assert (await client.post("/api/v1/auth/otp/request", json={"phone": "12345"})).status_code == 422


async def test_login_is_rate_limited_per_ip(client, monkeypatch):
    monkeypatch.setattr(ratelimit, "ENABLED", True)
    codes = []
    for _ in range(20):
        r = await client.post("/api/v1/auth/login", json={"method": "email", "email": "x@example.com", "password": "wrongwrong"})
        codes.append(r.status_code)
    assert 429 in codes and codes[0] == 401


async def test_admin_routes_are_protected_by_role(client, make_user):
    for path in ("/api/v1/admin/dashboard", "/api/v1/admin/orders", "/api/v1/admin/products"):
        assert (await client.get(path)).status_code == 401
    customer = await make_user(Role.customer)
    assert (await client.get("/api/v1/admin/dashboard", headers=auth_headers(customer))).status_code == 403
    admin = await make_user(Role.admin)
    r = await client.get("/api/v1/admin/dashboard", headers=auth_headers(admin))
    assert r.status_code == 200
    assert {"total_orders", "pending_orders", "total_revenue", "cod_orders", "online_orders"} <= set(r.json())
