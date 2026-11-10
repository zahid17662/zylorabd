"""Test fixtures.

Tests run against real PostgreSQL (row locking can't be faked) but never touch real data: every run
creates a throwaway schema inside the configured database, maps all tables into it with SQLAlchemy's
schema_translate_map, and drops that schema (and only that schema) at the end.
"""
import random
import uuid
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401  (register tables)
from app.core import ratelimit
from app.core.config import settings
from app.core.database import Base, get_db
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models import AuthProvider, Product, ProductVariant, Role, User

SCHEMA = f"test_{uuid.uuid4().hex[:10]}"
CONNECT = {"ssl": settings.db_ssl, "statement_cache_size": 0}


@pytest_asyncio.fixture(scope="session")
async def engine():
    admin = create_async_engine(settings.async_database_url, connect_args=CONNECT)
    async with admin.begin() as c:
        await c.execute(text(f'CREATE SCHEMA "{SCHEMA}"'))
    eng = create_async_engine(
        settings.async_database_url, connect_args=CONNECT, pool_size=10, max_overflow=10,
        execution_options={"schema_translate_map": {None: SCHEMA}},
    )
    async with eng.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()
    async with admin.begin() as c:
        await c.execute(text(f'DROP SCHEMA "{SCHEMA}" CASCADE'))
    await admin.dispose()


@pytest_asyncio.fixture(scope="session")
async def sessions(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def client(sessions, monkeypatch):
    async def _get_db():
        async with sessions() as s:
            yield s

    app.dependency_overrides[get_db] = _get_db
    monkeypatch.setattr(ratelimit, "ENABLED", False)
    monkeypatch.setattr(settings, "payment_gateway_api_key", "")  # use the HMAC webhook mode
    monkeypatch.setattr(settings, "payment_webhook_secret", "test-webhook-secret")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


def rand_phone() -> str:
    return "017" + "".join(random.choices("0123456789", k=8))


@pytest.fixture
def make_user(sessions):
    async def _make(role: Role = Role.customer, method: AuthProvider = AuthProvider.email, password: str = "Passw0rd!x"):
        async with sessions() as s:
            u = User(
                name="Test User", email=f"{uuid.uuid4().hex[:10]}@example.com", phone=rand_phone(),
                password_hash=hash_password(password), auth_provider=method, role=role,
            )
            s.add(u)
            await s.commit()
            return u

    return _make


def auth_headers(user: User, method: str = "email") -> dict:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role.value, method)}"}


@pytest.fixture
def make_product(sessions):
    async def _make(stock: dict[str, int] | None = None, price: str = "1000.00", discount: str = "0"):
        stock = stock or {"M": 5}
        slug = f"p-{uuid.uuid4().hex[:10]}"
        async with sessions() as s:
            p = Product(
                title="Test Kurti", slug=slug, category="Women", base_price=Decimal(price),
                discount_percent=Decimal(discount), images=[],
                variants=[ProductVariant(size=sz, stock_quantity=q, sku=f"{slug}-{sz}") for sz, q in stock.items()],
            )
            s.add(p)
            await s.commit()
            await s.refresh(p, ["variants"])
            return p

    return _make


def checkout_body(variant_id, qty: int = 1, method: str = "cod", zone: str = "inside_dhaka", **extra) -> dict:
    body = {
        "items": [{"variant_id": str(variant_id), "quantity": qty}],
        "shipping": {"recipient_name": "Rahim", "phone": "01712345678", "address": "House 1, Road 2, Dhaka", "zone": zone},
        "payment_method": method,
    }
    if method == "online":
        body["online_provider"] = "bkash"
    body.update(extra)
    return body
