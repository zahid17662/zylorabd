import re
import uuid
from datetime import date, datetime, time as dtime, timedelta, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.api.deps import require_admin
from app.models import (
    AuthProvider, Order, OrderItem, OrderStatus, PaymentMethod, PaymentStatus, Product, ProductVariant,
    Transaction, User,
)
from app.schemas import (
    AdminOrderListOut, AdminOrderOut, AdminProductOut, AttributionSplit, DashboardOut, DeleteResultOut,
    LowStockVariantOut, ProductDetailOut, ProductIn, ProductPatch, SplitRow, StatsOut, StatusUpdateIn,
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


def to_admin_product(p: Product) -> AdminProductOut:
    return AdminProductOut(**to_detail(p).model_dump(), total_stock=sum(v.stock_quantity for v in p.variants))


@router.get("/products", response_model=list[AdminProductOut])
async def admin_list_products(db: AsyncSession = Depends(get_db), include_inactive: bool = True):
    """All products (archived included by default) with their size variants and total stock."""
    stmt = select(Product).options(selectinload(Product.variants)).order_by(Product.created_at.desc())
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    return [to_admin_product(p) for p in await db.scalars(stmt)]


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


def _reject_duplicate_sizes(items: list | None) -> None:
    if items and len({i.size for i in items}) != len(items):
        raise HTTPException(422, "Duplicate size in request")


async def _load_product(db: AsyncSession, product_id: uuid.UUID, *, lock_variants: bool = False) -> Product:
    if lock_variants:
        # Same lock order as checkout (variants by id), so a restock cannot overwrite a concurrent deduction.
        await db.execute(
            select(ProductVariant).where(ProductVariant.product_id == product_id).order_by(ProductVariant.id)
            .with_for_update().execution_options(populate_existing=True)
        )
    p = await db.scalar(select(Product).where(Product.id == product_id).options(selectinload(Product.variants)))
    if p is None:
        raise HTTPException(404, "Product not found")
    return p


async def _apply_product_update(
    db: AsyncSession, product_id: uuid.UUID, data: dict, variants: list | None
) -> ProductDetailOut:
    """Shared by PUT (every field) and PATCH (only the fields sent). Sizes are upserted, never removed:
    past orders reference variants."""
    _reject_duplicate_sizes(variants)
    p = await _load_product(db, product_id, lock_variants=variants is not None)
    for k, v in data.items():
        setattr(p, k, v)
    if variants is not None:
        by_size = {v.size: v for v in p.variants}
        for vin in variants:
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


@router.put("/products/{product_id}", response_model=ProductDetailOut)
async def replace_product(product_id: uuid.UUID, body: ProductIn, db: AsyncSession = Depends(get_db)):
    return await _apply_product_update(db, product_id, body.model_dump(exclude={"variants"}), body.variants)


@router.patch("/products/{product_id}", response_model=ProductDetailOut)
async def update_product(product_id: uuid.UUID, body: ProductPatch, db: AsyncSession = Depends(get_db)):
    return await _apply_product_update(
        db, product_id, body.model_dump(exclude_unset=True, exclude={"variants"}), body.variants
    )


class StockUpdateIn(BaseModel):
    """Either set an absolute `stock_quantity`, or add `delta` units (negative removes) atomically."""

    size: str = Field(min_length=1, max_length=20)
    stock_quantity: int | None = Field(default=None, ge=0)
    delta: int | None = Field(default=None, ge=-100_000, le=100_000)

    @model_validator(mode="after")
    def _exactly_one(self):
        if (self.stock_quantity is None) == (self.delta is None):
            raise ValueError("Send exactly one of stock_quantity or delta")
        return self


@router.patch("/products/{product_id}/stock", response_model=ProductDetailOut)
async def update_stock(product_id: uuid.UUID, body: list[StockUpdateIn], db: AsyncSession = Depends(get_db)):
    """Set per-size stock. Variant rows are locked (checkout's order) so a restock cannot race with a sale."""
    _reject_duplicate_sizes(body)
    p = await _load_product(db, product_id, lock_variants=True)
    by_size = {v.size: v for v in p.variants}
    for u in body:
        current = by_size[u.size].stock_quantity if u.size in by_size else 0
        qty = u.stock_quantity if u.stock_quantity is not None else current + (u.delta or 0)
        if qty < 0:
            raise HTTPException(422, f"Stock for {u.size} cannot go below zero")
        if u.size in by_size:
            by_size[u.size].stock_quantity = qty
        else:
            p.variants.append(ProductVariant(size=u.size, stock_quantity=qty, sku=make_sku(p.slug, u.size)))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Duplicate size or SKU")
    return to_detail(await _load_product(db, product_id))


@router.delete("/products/{product_id}", response_model=DeleteResultOut)
async def delete_product(product_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Products that were ever ordered are archived (past orders reference their variants); others are removed."""
    p = await _load_product(db, product_id)
    ordered = await db.scalar(
        select(func.count()).select_from(OrderItem).join(ProductVariant, OrderItem.variant_id == ProductVariant.id)
        .where(ProductVariant.product_id == product_id)
    )
    if ordered:
        p.is_active = False
        await db.commit()
        return DeleteResultOut(result="archived")
    try:
        await db.delete(p)
        await db.commit()
    except IntegrityError:  # an order for this product landed between the check and the delete
        await db.rollback()
        (await _load_product(db, product_id)).is_active = False
        await db.commit()
        return DeleteResultOut(result="archived")
    return DeleteResultOut(result="deleted")


class PresignIn(BaseModel):
    content_type: str
    size_bytes: int = Field(gt=0)


@router.post("/media/presigned-url")
@router.post("/media/presign")  # original path, still used by the current dashboard
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
    q: str | None, payment_provider: str | None = None,
):
    conds = []
    if payment_provider:
        conds.append(Order.id.in_(select(Transaction.order_id).where(Transaction.provider == payment_provider)))
    if order_status: conds.append(Order.order_status == order_status)
    if payment_method: conds.append(Order.payment_method == payment_method)
    if payment_status: conds.append(Order.payment_status == payment_status)
    if login_method: conds.append(Order.login_method == login_method)
    if order_source: conds.append(Order.order_source == order_source)
    if date_from: conds.append(Order.created_at >= datetime.combine(date_from, dtime.min, DHAKA))
    if date_to: conds.append(Order.created_at < datetime.combine(date_to + timedelta(days=1), dtime.min, DHAKA))
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")  # % and _ are literal characters
        like = f"%{escaped}%"
        conds.append(or_(
            Order.order_number.ilike(like, escape="\\"), Order.shipping_phone.ilike(like, escape="\\"),
            Order.recipient_name.ilike(like, escape="\\"),
        ))
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
    order_source: str | None = Query(default=None, max_length=64),
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = Query(default=None, max_length=100),
    payment_provider: Literal["bkash", "nagad", "card"] | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    conds = _admin_order_filters(
        order_status, payment_method, payment_status, login_method, order_source, date_from, date_to, q, payment_provider
    )
    total = await db.scalar(select(func.count()).select_from(Order).where(*conds))
    rows = await db.scalars(
        select(Order).where(*conds)
        .options(selectinload(Order.items), selectinload(Order.transactions), selectinload(Order.user))
        .order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    return AdminOrderListOut(items=[_to_admin(o) for o in rows], total=total or 0, page=page, page_size=page_size)


async def _load_order(db: AsyncSession, order_id: uuid.UUID, *, lock: bool = False) -> Order:
    stmt = (
        select(Order).where(Order.id == order_id)
        .options(selectinload(Order.items), selectinload(Order.transactions), selectinload(Order.user))
    )
    order = await db.scalar(stmt.with_for_update(of=Order) if lock else stmt)
    if order is None:
        raise HTTPException(404, "Order not found")
    return order


@router.get("/orders/{order_id}", response_model=AdminOrderOut)
async def admin_order_detail(order_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Customer, shipping address, line items (with size) and the payment gateway transaction log."""
    return _to_admin(await _load_order(db, order_id))


@router.patch("/orders/{order_id}/status", response_model=AdminOrderOut)
async def update_order_status(order_id: uuid.UUID, body: StatusUpdateIn, db: AsyncSession = Depends(get_db)):
    """Row-locked transition. Cancelling returns stock once; delivering a COD order records the cash as paid."""
    order = await _load_order(db, order_id, lock=True)
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


# ---------------- Stats ----------------
LOW_STOCK_THRESHOLD = 3
PAYMENT_KEYS = ("COD", "BKASH", "NAGAD", "CARD")
CHANNEL_KEYS = tuple(m.value.upper() for m in AuthProvider)


def _split(rows: dict[str, tuple[int, Decimal]], always: tuple[str, ...] = ()) -> list[SplitRow]:
    """Stable ordering: the expected keys first (zero-filled), then anything else alphabetically."""
    keys = [*always, *sorted(k for k in rows if k not in always)]
    return [SplitRow(key=k, orders=rows.get(k, (0, Decimal(0)))[0], revenue=rows.get(k, (0, Decimal(0)))[1]) for k in keys]


def _add(rows: dict[str, tuple[int, Decimal]], key: str, orders: int, revenue: Decimal) -> None:
    prev_orders, prev_revenue = rows.get(key, (0, Decimal(0)))
    rows[key] = (prev_orders + orders, prev_revenue + revenue)


@router.get("/stats", response_model=StatsOut)
async def stats(db: AsyncSession = Depends(get_db)):
    """KPI and attribution summary: a handful of grouped queries, no per-order work in Python.

    Order counts in the splits exclude cancelled orders; revenue is paid and non-cancelled only."""
    live = Order.order_status != OrderStatus.cancelled
    revenue = func.coalesce(func.sum(case((Order.payment_status == PaymentStatus.paid, Order.total_amount), else_=0)), 0)

    by_status = dict((await db.execute(select(Order.order_status, func.count()).group_by(Order.order_status))).all())
    count = lambda *s: sum(by_status.get(x, 0) for x in s)  # noqa: E731
    total_revenue = await db.scalar(select(revenue).where(live))

    provider = select(Transaction.order_id, func.max(Transaction.provider).label("provider")).group_by(Transaction.order_id).subquery()
    pay_rows: dict[str, tuple[int, Decimal]] = {}
    for method, prov, n, rev in await db.execute(
        select(Order.payment_method, provider.c.provider, func.count(Order.id), revenue)
        .outerjoin(provider, provider.c.order_id == Order.id).where(live)
        .group_by(Order.payment_method, provider.c.provider)
    ):
        key = "COD" if method == PaymentMethod.cod else (prov or "online").upper()
        _add(pay_rows, key, n, Decimal(rev))

    channels = {m.value.upper(): (n, Decimal(rev)) for m, n, rev in await db.execute(
        select(Order.login_method, func.count(Order.id), revenue).where(live).group_by(Order.login_method))}
    source_key = func.upper(func.coalesce(Order.order_source, "direct"))
    sources = {k: (n, Decimal(rev)) for k, n, rev in await db.execute(
        select(source_key, func.count(Order.id), revenue).where(live).group_by(source_key))}

    low_rows = await db.execute(
        select(ProductVariant, Product.title)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(Product.is_active.is_(True), ProductVariant.stock_quantity <= LOW_STOCK_THRESHOLD)
        .order_by(ProductVariant.stock_quantity, Product.title, ProductVariant.size)
    )
    return StatsOut(
        total_orders=sum(by_status.values()),
        pending_orders=count(OrderStatus.pending, OrderStatus.awaiting_payment),
        confirmed_orders=count(OrderStatus.confirmed),
        pending_fulfillment=count(OrderStatus.pending, OrderStatus.awaiting_payment, OrderStatus.confirmed),
        shipped_orders=count(OrderStatus.shipped),
        delivered_orders=count(OrderStatus.delivered),
        cancelled_orders=count(OrderStatus.cancelled),
        total_revenue=Decimal(total_revenue),
        payment_method_split=_split(pay_rows, PAYMENT_KEYS),
        order_attribution_split=AttributionSplit(
            login_channel=_split(channels, CHANNEL_KEYS),
            order_source=_split(sources, ("DIRECT",)),
        ),
        low_stock_variants=[
            LowStockVariantOut(
                product_id=v.product_id, product_title=title, variant_id=v.id, size=v.size, sku=v.sku,
                stock_quantity=v.stock_quantity,
            )
            for v, title in low_rows
        ],
    )


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
    revenue = await one(func.coalesce(func.sum(Order.total_amount), 0), live, Order.payment_status == PaymentStatus.paid)
    cod_orders = await one(func.count(Order.id), live, Order.payment_method == PaymentMethod.cod)
    online_orders = await one(func.count(Order.id), live, Order.payment_method == PaymentMethod.online)
    cod_rev = await one(
        func.coalesce(func.sum(Order.total_amount), 0),
        live, Order.payment_method == PaymentMethod.cod, Order.payment_status == PaymentStatus.paid,
    )
    online_rev = await one(
        func.coalesce(func.sum(Order.total_amount), 0),
        live, Order.payment_method == PaymentMethod.online, Order.payment_status == PaymentStatus.paid,
    )
    return DashboardOut(
        total_orders=total, pending_orders=pending, todays_orders=t_orders,
        todays_sales=Decimal(t_sales), total_revenue=Decimal(revenue),
        cod_orders=cod_orders, online_orders=online_orders,
        cod_revenue=Decimal(cod_rev), online_revenue=Decimal(online_rev),
    )
