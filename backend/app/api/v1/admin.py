import re
import uuid
from datetime import date, datetime, time as dtime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.api.deps import require_admin
from app.models import (
    AuthProvider, Order, OrderStatus, PaymentMethod, PaymentStatus, Product, ProductVariant, User,
)
from app.schemas import (
    AdminOrderListOut, AdminOrderOut, DashboardOut, ProductDetailOut, ProductIn, ProductPatch, StatusUpdateIn,
)
from app.services import storage
from app.services.inventory import cancel_order
from app.api.v1.products import to_detail

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

DHAKA = timezone(timedelta(hours=6))
TRANSITIONS = {
    OrderStatus.pending: {OrderStatus.confirmed, OrderStatus.cancelled},
    OrderStatus.awaiting_payment: {OrderStatus.cancelled},  # only the payment webhook can confirm these
    OrderStatus.confirmed: {OrderStatus.shipped, OrderStatus.cancelled},
    OrderStatus.shipped: {OrderStatus.delivered, OrderStatus.cancelled},
    OrderStatus.delivered: set(),
    OrderStatus.cancelled: set(),
}


# ---------------- Products ----------------
def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "product"


def make_sku(slug: str, size: str) -> str:
    return f"{slug[:40]}-{re.sub(r'[^A-Za-z0-9]+', '', size).upper()}"


@router.get("/products", response_model=list[ProductDetailOut])
async def admin_list_products(db: AsyncSession = Depends(get_db), include_inactive: bool = True):
    stmt = select(Product).options(selectinload(Product.variants)).order_by(Product.created_at.desc())
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    return [to_detail(p) for p in await db.scalars(stmt)]


@router.post("/products", response_model=ProductDetailOut, status_code=201)
async def create_product(body: ProductIn, db: AsyncSession = Depends(get_db)):
    base_slug = slugify(body.title)
    slug = f"{base_slug}-{uuid.uuid4().hex[:6]}"
    product = Product(
        **body.model_dump(exclude={"variants"}), slug=slug,
        variants=[
            ProductVariant(size=v.size, stock_quantity=v.stock_quantity, sku=v.sku or make_sku(slug, v.size))
            for v in body.variants
        ],
    )
    db.add(product)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Duplicate size or SKU")
    return to_detail(await _load_product(db, product.id))


async def _load_product(db: AsyncSession, product_id: uuid.UUID) -> Product:
    p = await db.scalar(select(Product).where(Product.id == product_id).options(selectinload(Product.variants)))
    if p is None:
        raise HTTPException(404, "Product not found")
    return p


@router.patch("/products/{product_id}", response_model=ProductDetailOut)
async def update_product(product_id: uuid.UUID, body: ProductPatch, db: AsyncSession = Depends(get_db)):
    p = await _load_product(db, product_id)
    data = body.model_dump(exclude_unset=True, exclude={"variants"})
    for k, v in data.items():
        setattr(p, k, v)
    if body.variants is not None:
        by_size = {v.size: v for v in p.variants}
        for vin in body.variants:
            if vin.size in by_size:
                by_size[vin.size].stock_quantity = vin.stock_quantity
            else:
                p.variants.append(ProductVariant(
                    size=vin.size, stock_quantity=vin.stock_quantity, sku=vin.sku or make_sku(p.slug, vin.size)
                ))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Duplicate size or SKU")
    return to_detail(await _load_product(db, product_id))


class StockUpdateIn(BaseModel):
    size: str = Field(min_length=1, max_length=20)
    stock_quantity: int = Field(ge=0)


@router.patch("/products/{product_id}/stock", response_model=ProductDetailOut)
async def update_stock(product_id: uuid.UUID, body: list[StockUpdateIn], db: AsyncSession = Depends(get_db)):
    """Set per-size stock. Rows are locked so a restock cannot race with a checkout."""
    p = await db.scalar(
        select(Product).where(Product.id == product_id).options(selectinload(Product.variants)).with_for_update(of=Product)
    )
    if p is None:
        raise HTTPException(404, "Product not found")
    if len({u.size for u in body}) != len(body):
        raise HTTPException(422, "Duplicate size in request")
    by_size = {v.size: v for v in p.variants}
    for u in body:
        if u.size in by_size:
            by_size[u.size].stock_quantity = u.stock_quantity
        else:
            p.variants.append(ProductVariant(size=u.size, stock_quantity=u.stock_quantity, sku=make_sku(p.slug, u.size)))
    await db.commit()
    return to_detail(await _load_product(db, product_id))


@router.delete("/products/{product_id}", status_code=204)
async def deactivate_product(product_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Soft delete: past orders reference variants, so rows are kept and just hidden."""
    p = await _load_product(db, product_id)
    p.is_active = False
    await db.commit()


class PresignIn(BaseModel):
    content_type: str
    size_bytes: int = Field(gt=0)


@router.post("/media/presign")
async def presign_media_upload(body: PresignIn):
    """Presigned PUT URL: the browser uploads straight to R2."""
    try:
        return storage.presign_put(body.content_type, body.size_bytes)
    except storage.StorageNotConfigured:
        raise HTTPException(503, "Media storage is not configured")
    except storage.InvalidUpload as e:
        raise HTTPException(422, str(e))


# ---------------- Orders ----------------
def _admin_order_filters(
    order_status: OrderStatus | None, payment_method: PaymentMethod | None, payment_status: PaymentStatus | None,
    login_method: AuthProvider | None, order_source: str | None, date_from: date | None, date_to: date | None,
    q: str | None,
):
    conds = []
    if order_status: conds.append(Order.order_status == order_status)
    if payment_method: conds.append(Order.payment_method == payment_method)
    if payment_status: conds.append(Order.payment_status == payment_status)
    if login_method: conds.append(Order.login_method == login_method)
    if order_source: conds.append(Order.order_source == order_source)
    if date_from: conds.append(Order.created_at >= datetime.combine(date_from, dtime.min, DHAKA))
    if date_to: conds.append(Order.created_at < datetime.combine(date_to + timedelta(days=1), dtime.min, DHAKA))
    if q:
        like = f"%{q}%"
        conds.append(or_(Order.order_number.ilike(like), Order.shipping_phone.ilike(like), Order.recipient_name.ilike(like)))
    return conds


def _to_admin(o: Order) -> AdminOrderOut:
    base = AdminOrderOut.model_validate(
        {**{c: getattr(o, c) for c in (
            "id", "order_number", "subtotal", "shipping_fee", "total_amount", "payment_method", "payment_status",
            "order_status", "delivery_zone", "recipient_name", "shipping_phone", "shipping_address", "created_at",
            "items", "login_method", "order_source", "utm", "transactions",
        )},
         "customer_name": o.user.name, "customer_email": o.user.email, "customer_phone": o.user.phone},
        from_attributes=True,
    )
    return base


@router.get("/orders", response_model=AdminOrderListOut)
async def admin_orders(
    db: AsyncSession = Depends(get_db),
    order_status: OrderStatus | None = None,
    payment_method: PaymentMethod | None = None,
    payment_status: PaymentStatus | None = None,
    login_method: AuthProvider | None = None,
    order_source: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    conds = _admin_order_filters(order_status, payment_method, payment_status, login_method, order_source, date_from, date_to, q)
    total = await db.scalar(select(func.count()).select_from(Order).where(*conds))
    rows = await db.scalars(
        select(Order).where(*conds)
        .options(selectinload(Order.items), selectinload(Order.transactions), selectinload(Order.user))
        .order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    return AdminOrderListOut(items=[_to_admin(o) for o in rows], total=total or 0, page=page, page_size=page_size)


@router.patch("/orders/{order_id}/status", response_model=AdminOrderOut)
async def update_order_status(order_id: uuid.UUID, body: StatusUpdateIn, db: AsyncSession = Depends(get_db)):
    order = await db.scalar(
        select(Order).where(Order.id == order_id)
        .options(selectinload(Order.items), selectinload(Order.transactions), selectinload(Order.user))
        .with_for_update()
    )
    if order is None:
        raise HTTPException(404, "Order not found")
    if body.status not in TRANSITIONS[order.order_status]:
        raise HTTPException(409, f"Cannot move order from {order.order_status.value} to {body.status.value}")
    if body.status == OrderStatus.cancelled:
        await cancel_order(db, order)
    else:
        order.order_status = body.status
        if body.status == OrderStatus.delivered and order.payment_method == PaymentMethod.cod:
            order.payment_status = PaymentStatus.paid  # cash collected on delivery
    await db.commit()
    return _to_admin(order)


@router.get("/dashboard", response_model=DashboardOut)
async def dashboard(db: AsyncSession = Depends(get_db)):
    start = datetime.combine(datetime.now(DHAKA).date(), dtime.min, DHAKA)
    live = Order.order_status != OrderStatus.cancelled

    async def one(expr, *conds):
        return await db.scalar(select(expr).where(*conds))

    total = await one(func.count(Order.id))
    # "Pending" = accepted but not yet shipped (COD confirmed + awaiting payment + legacy pending)
    pending = await one(
        func.count(Order.id),
        Order.order_status.in_([OrderStatus.pending, OrderStatus.awaiting_payment, OrderStatus.confirmed]),
    )
    t_orders = await one(func.count(Order.id), live, Order.created_at >= start)
    t_sales = await one(func.coalesce(func.sum(Order.total_amount), 0), live, Order.created_at >= start)
    revenue = await one(func.coalesce(func.sum(Order.total_amount), 0), Order.payment_status == PaymentStatus.paid)
    cod_orders = await one(func.count(Order.id), live, Order.payment_method == PaymentMethod.cod)
    online_orders = await one(func.count(Order.id), live, Order.payment_method == PaymentMethod.online)
    cod_rev = await one(
        func.coalesce(func.sum(Order.total_amount), 0),
        Order.payment_method == PaymentMethod.cod, Order.payment_status == PaymentStatus.paid,
    )
    online_rev = await one(
        func.coalesce(func.sum(Order.total_amount), 0),
        Order.payment_method == PaymentMethod.online, Order.payment_status == PaymentStatus.paid,
    )
    return DashboardOut(
        total_orders=total, pending_orders=pending, todays_orders=t_orders,
        todays_sales=Decimal(t_sales), total_revenue=Decimal(revenue),
        cod_orders=cod_orders, online_orders=online_orders,
        cod_revenue=Decimal(cod_rev), online_revenue=Decimal(online_rev),
    )
