from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# Supabase/Neon poolers run in transaction mode: disable asyncpg's prepared statement cache.
engine = create_async_engine(
    settings.async_database_url,
    connect_args={"ssl": settings.db_ssl_arg, "statement_cache_size": 0},
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=300,
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
AsyncSessionLocal = SessionLocal  # alias


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
