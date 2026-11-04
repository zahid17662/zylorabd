import secrets
import string
import uuid
from collections import defaultdict
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.api.deps import Principal, get_principal
from app.models import (
    DeliveryZone, Order, OrderItem, OrderStatus, PaymentMethod, PaymentStatus, Product, ProductVariant, Transaction, TxStatus,
)
from app.schemas import CheckoutIn, CheckoutOut, OrderOut
from app.core.config import settings
from app.services import payment
from app.services.inventory import cancel_order
from app.services.notify import notify_order_placed

router = APIRouter(prefix="/orders", tags=["orders"])

_ALPHABET = string.ascii_uppercase + string.digits


def new_order_number() -> str:
    return "ZB" + "".join(secrets.choice(_ALPHABET) for _ in range(8))


def shipping_fee(zone: DeliveryZone) -> Decimal:
    fee = settings.shipping_inside_dhaka if zone == DeliveryZone.inside_dhaka else settings.shipping_outside_dhaka
    return Decimal(fee).quantize(Decimal("0.01"))


@router.post("/checkout", response_model=CheckoutOut, status_code=201)
async def checkout(
    body: CheckoutIn,
    tasks: BackgroundTasks,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    if body.payment_method == PaymentMethod.online and not body.online_provider:
        raise HTTPException(422, "online_provider is required for online payments")

    # Merge duplicate lines for the same variant.
    wanted: dict[uuid.UUID, int] = defaultdict(int)
    for line in body.items:
        wanted[line.variant_id] += line.quantity

    # Lock variant rows in a stable order (prevents deadlocks between concurrent checkouts).
    # SELECT ... FOR UPDATE: a concurrent buyer of the same size waits here until we commit,
    # then sees the decremented stock.
    variants = {
        v.id: v
        for v in await db.scalars(
            select(ProductVariant).where(ProductVariant.id.in_(wanted)).order_by(ProductVariant.id).with_for_update()
        )
    }
    if len(variants) != len(wanted):
        raise HTTPException(404, "One or more items no longer exist")
    products = {
        p.id: p
        for p in await db.scalars(select(Product).where(Product.id.in_({v.product_id for v in variants.values()})))
    }

    problems = []
    for vid, qty in wanted.items():
        v = variants[vid]
        p = products[v.product_id]
        if not p.is_active:
            problems.append(f"{p.title} is no longer available")
        elif v.stock_quantity < qty:
            left = v.stock_quantity
            problems.append(f"{p.title} ({v.size}): " + (f"only {left} left" if left else "sold out"))
    if problems:
        await db.rollback()
        raise HTTPException(400, {"message": "Out of stock", "problems": problems})

    # Server-side pricing: nothing monetary comes from the client.
    items, subtotal = [], Decimal(0)
    for vid, qty in wanted.items():
        v = variants[vid]
        p = products[v.product_id]
        unit = p.final_price
        subtotal += unit * qty
        v.stock_quantity -= qty
        items.append(OrderItem(variant_id=vid, product_title=p.title, size=v.size, quantity=qty, unit_price=unit))

    fee = shipping_fee(body.shipping.zone)
    attr = body.attribution
    online = body.payment_method == PaymentMethod.online
    order = Order(
        order_number=new_order_number(),
        user_id=principal.user.id,
        subtotal=subtotal,
        shipping_fee=fee,
        total_amount=subtotal + fee,
        payment_method=body.payment_method,
        # COD: confirmed immediately, cash due on delivery. Online: wait for the gateway webhook.
        payment_status=PaymentStatus.pending if online else PaymentStatus.unpaid,
        order_status=OrderStatus.awaiting_payment if online else OrderStatus.confirmed,
        login_method=principal.login_method,
        order_source=(attr.utm_source if attr else None) or "direct",
        utm=attr.model_dump(exclude_none=True) if attr else None,
        recipient_name=body.shipping.recipient_name,
        shipping_phone=body.shipping.phone,
        shipping_address=body.shipping.address,
        delivery_zone=body.shipping.zone,
        items=items,
    )
    db.add(order)
    await db.flush()

    payment_url = None
    if body.payment_method == PaymentMethod.online:
        tx = Transaction(order_id=order.id, amount=order.total_amount, provider=body.online_provider, status=TxStatus.initiated)
        db.add(tx)
        await db.flush()
        tx_id = str(tx.id)
        if not settings.uddoktapay_enabled:  # sandbox/dev fallback
            payment_url = payment.build_payment_url(tx_id, str(order.total_amount), body.online_provider)

    await db.commit()
    order = await db.scalar(select(Order).where(Order.id == order.id).options(selectinload(Order.items)))

    if online and settings.uddoktapay_enabled:
        # Called after commit so row locks aren't held during the network call.
        try:
            payment_url = await payment.create_uddokta_charge(
                tx_id, str(order.total_amount), order.recipient_name, principal.user.email, order.shipping_phone
            )
        except payment.GatewayError as e:
            order.payment_status = PaymentStatus.failed
            await cancel_order(db, order)  # give the reserved stock back
            await db.commit()
            raise HTTPException(502, f"Could not start online payment: {e}. Please try again or choose Cash on Delivery.")

    if body.payment_method == PaymentMethod.cod:
        tasks.add_task(
            notify_order_placed, order.shipping_phone, principal.user.email, order.order_number, str(order.total_amount), False
        )
    return CheckoutOut(order=OrderOut.model_validate(order), payment_url=payment_url)


@router.get("", response_model=list[OrderOut])
async def my_orders(principal: Principal = Depends(get_principal), db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(
        select(Order).where(Order.user_id == principal.user.id)
        .options(selectinload(Order.items)).order_by(Order.created_at.desc()).limit(100)
    )
    return list(rows)


@router.get("/{order_number}", response_model=OrderOut)
async def my_order(order_number: str, principal: Principal = Depends(get_principal), db: AsyncSession = Depends(get_db)):
    order = await db.scalar(
        select(Order).where(Order.order_number == order_number, Order.user_id == principal.user.id)
        .options(selectinload(Order.items))
    )
    if order is None:
        raise HTTPException(404, "Order not found")
    return order
