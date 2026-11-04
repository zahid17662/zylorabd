import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.models import Order, OrderStatus, PaymentMethod, PaymentStatus
from app.api.v1 import admin, auth, checkout, products, webhooks
from app.core.security import now
from app.services.inventory import cancel_order

log = logging.getLogger("zylora")


async def sweep_expired_orders(db) -> int:
    """Cancel online orders unpaid past the hold window and return their stock. Returns the count."""
    cutoff = now() - timedelta(minutes=settings.stock_hold_minutes)
    stale = (await db.scalars(
        select(Order).where(
            Order.payment_method == PaymentMethod.online,
            Order.payment_status == PaymentStatus.pending,
            Order.order_status == OrderStatus.awaiting_payment,
            Order.created_at < cutoff,
        ).options(selectinload(Order.items)).with_for_update(skip_locked=True)
    )).all()
    for order in stale:
        order.payment_status = PaymentStatus.failed
        await cancel_order(db, order)
    await db.commit()
    return len(stale)


async def expire_unpaid_orders() -> None:
    """Free stock held by online orders the customer never paid for."""
    while True:
        try:
            async with SessionLocal() as db:
                await sweep_expired_orders(db)
        except Exception:
            log.exception("expire_unpaid_orders failed")
        await asyncio.sleep(300)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(expire_unpaid_orders())
    yield
    task.cancel()
    await engine.dispose()


def create_app() -> FastAPI:
    application = FastAPI(title="Zylora BD API", version="1.0.0", lifespan=lifespan)
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip() and o.strip() != "*"]
    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,  # tokens travel in the Authorization header, never cookies
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    for r in (auth.router, products.router, checkout.router, webhooks.router, admin.router):
        application.include_router(r, prefix="/api/v1")

    @application.exception_handler(SQLAlchemyError)
    async def db_error(request: Request, exc: SQLAlchemyError):
        log.exception("database error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=503, content={"detail": "Service temporarily unavailable. Please retry."})

    @application.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Something went wrong on our side."})

    @application.get("/health")
    async def health():
        try:
            async with SessionLocal() as db:
                await db.execute(text("SELECT 1"))
        except Exception:
            log.exception("health check: database unreachable")
            return JSONResponse(status_code=503, content={"status": "degraded", "database": "down"})
        return {"status": "ok", "database": "up"}

    return application


app = create_app()
