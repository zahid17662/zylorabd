"""Supabase Auth bridge: the API also accepts Supabase access tokens (GoTrue is faked here)."""
import uuid

import pytest

from app.core.config import settings
from app.models import Role
from app.services import supabase_auth
from app.services.supabase_auth import SupabaseIdentity

ME = "/api/v1/auth/me"


@pytest.fixture
def sb(monkeypatch):
    """Enable the bridge and let each test decide what GoTrue says about a token."""
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_publishable_key", "sb_publishable_test")
    known: dict[str, SupabaseIdentity] = {}

    async def fake_verify(token: str):
        return known.get(token)

    monkeypatch.setattr(supabase_auth, "verify_token", fake_verify)
    return known


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def ident(user_id, email, *, verified=True, method="email", name="Sam"):
    return SupabaseIdentity(id=user_id, email=email, email_verified=verified, name=name, login_method=method)


async def test_supabase_token_of_existing_user(client, make_user, sb):
    user = await make_user()
    sb["tok"] = ident(user.id, user.email)
    r = await client.get(ME, headers=bearer("tok"))
    assert r.status_code == 200 and r.json()["id"] == str(user.id)


async def test_unknown_token_is_rejected(client, sb):
    assert (await client.get(ME, headers=bearer("nope"))).status_code == 401


async def test_disabled_bridge_rejects_supabase_tokens(client, make_user, monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "")
    assert (await client.get(ME, headers=bearer("anything"))).status_code == 401


async def test_first_sight_creates_a_customer_only_for_verified_email(client, sb):
    uid = uuid.uuid4()
    email = f"{uid.hex[:10]}@example.com"
    sb["unverified"] = ident(uid, email, verified=False)
    assert (await client.get(ME, headers=bearer("unverified"))).status_code == 401
    sb["verified"] = ident(uid, email, method="google", name="Gina")
    r = await client.get(ME, headers=bearer("verified"))
    assert r.status_code == 200
    assert r.json()["role"] == "customer" and r.json()["name"] == "Gina" and r.json()["email"] == email
    assert (await client.get(ME, headers=bearer("verified"))).status_code == 200  # second call reuses the row


async def test_never_links_to_an_existing_account_by_email(client, make_user, sb):
    victim = await make_user()
    sb["attacker"] = ident(uuid.uuid4(), victim.email)  # different id, same email
    assert (await client.get(ME, headers=bearer("attacker"))).status_code == 401


async def test_admin_role_comes_from_the_database_and_needs_the_password_login(client, make_user, sb):
    admin = await make_user(Role.admin)
    customer = await make_user()
    sb["admin-pw"] = ident(admin.id, admin.email, method="email")
    sb["admin-google"] = ident(admin.id, admin.email, method="google")
    sb["cust"] = ident(customer.id, customer.email)
    url = "/api/v1/admin/orders"
    assert (await client.get(url, headers=bearer("admin-pw"))).status_code == 200
    assert (await client.get(url, headers=bearer("admin-google"))).status_code == 403
    assert (await client.get(url, headers=bearer("cust"))).status_code == 403


async def test_sync_is_a_no_op_without_supabase(sessions, monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "")
    async with sessions() as s:
        await supabase_auth.sync_user(s, uuid.uuid4())  # must not touch the auth schema or raise
