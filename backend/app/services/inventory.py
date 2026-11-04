from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order, OrderStatus, ProductVariant


async def release_stock(db: AsyncSession, order: Order) -> None:
    """Return an order's reserved units to inventory exactly once. Caller commits."""
    if order.stock_released:
        return
    ids = sorted({i.variant_id for i in order.items})
    rows = await db.scalars(
        select(ProductVariant).where(ProductVariant.id.in_(ids)).order_by(ProductVariant.id).with_for_update()
    )
    by_id = {v.id: v for v in rows}
    for item in order.items:
        by_id[item.variant_id].stock_quantity += item.quantity
    order.stock_released = True


async def cancel_order(db: AsyncSession, order: Order) -> None:
    order.order_status = OrderStatus.cancelled
    await release_stock(db, order)
