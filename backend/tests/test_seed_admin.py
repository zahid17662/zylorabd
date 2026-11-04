import uuid

import pytest
from sqlalchemy import func, select

from conftest import rand_phone

from app.core.security import verify_password
from app.models import AuthProvider, Role, User
from scripts.seed_admin import SeedError, seed_admin


def _email() -> str:
    return f"{uuid.uuid4().hex[:10]}@example.com"


async def test_creates_admin_who_can_log_in_by_email_and_phone(client, sessions):
    email, phone = _email(), rand_phone()
    async with sessions() as db:
        assert await seed_admin(db, email, phone, "Str0ng-Pass!") == "created"
    async with sessions() as db:
        user = await db.scalar(select(User).where(User.email == email))
        assert user.role == Role.admin and user.phone == phone
        assert verify_password("Str0ng-Pass!", user.password_hash)

    r = await client.post("/api/v1/auth/login", json={"method": "email", "email": email, "password": "Str0ng-Pass!"})
    assert r.status_code == 200, r.text


async def test_is_idempotent_and_never_resets_an_existing_password(client, sessions):
    email = _email()
    async with sessions() as db:
        await seed_admin(db, email, None, "Str0ng-Pass!")
    async with sessions() as db:
        assert await seed_admin(db, email, None, "A-different-pass1") == "unchanged"
    async with sessions() as db:
        count = await db.scalar(select(func.count()).select_from(User).where(User.email == email))
        user = await db.scalar(select(User).where(User.email == email))
        assert count == 1 and verify_password("Str0ng-Pass!", user.password_hash)


async def test_promotes_an_existing_customer_and_fills_missing_phone(client, sessions, make_user):
    customer = await make_user()
    new_phone = rand_phone()
    async with sessions() as db:
        assert await seed_admin(db, customer.email, new_phone, "Str0ng-Pass!") == "promoted"
    async with sessions() as db:
        user = await db.get(User, customer.id)
        assert user.role == Role.admin
        assert user.phone == customer.phone  # an existing phone is never overwritten
        assert verify_password("Passw0rd!x", user.password_hash)  # nor the password


async def test_promotes_a_phone_only_account_without_a_password(client, sessions):
    phone, email = rand_phone(), _email()
    async with sessions() as db:
        db.add(User(name="Phone User", phone=phone, auth_provider=AuthProvider.phone, role=Role.customer))
        await db.commit()
    async with sessions() as db:
        assert await seed_admin(db, email, phone, "Str0ng-Pass!") == "promoted"
    async with sessions() as db:
        user = await db.scalar(select(User).where(User.phone == phone))
        assert user.role == Role.admin and user.email == email and verify_password("Str0ng-Pass!", user.password_hash)


async def test_refuses_when_email_and_phone_belong_to_different_users(client, sessions, make_user):
    a, b = await make_user(), await make_user()
    async with sessions() as db:
        with pytest.raises(SeedError):
            await seed_admin(db, a.email, b.phone, "Str0ng-Pass!")
    async with sessions() as db:
        assert (await db.get(User, a.id)).role == Role.customer


@pytest.mark.parametrize("email,phone,password", [("", None, "Str0ng-Pass!"), ("not-an-email", None, "Str0ng-Pass!"),
                                                  ("a@example.com", "12345", "Str0ng-Pass!"), ("a@example.com", None, "short")])
async def test_rejects_invalid_input(client, sessions, email, phone, password):
    async with sessions() as db:
        with pytest.raises(SeedError):
            await seed_admin(db, email, phone, password)
