import json
import uuid
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.models import Order, OrderStatus, PaymentStatus, Transaction, TxStatus
from app.core.security import now
from app.services import payment
from app.services.inventory import cancel_order
from app.services.notify import notify_order_placed

router = APIRouter(prefix="/payments", tags=["payments"])

SUCCESS = {"VALID", "VALIDATED", "SUCCESS", "COMPLETED"}
CANCELLED = {"CANCELLED", "CANCELED"}


@router.post("/webhook")
async def webhook(request: Request, tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Server-to-server IPN. This is the ONLY place an order becomes Paid."""
    raw = await request.body()
    try:
        data = json.loads(raw)
        if settings.uddoktapay_enabled:
            # UddoktaPay: authenticate the call, then ask the gateway itself whether the invoice is paid.
            if not payment.verify_uddokta_header(request.headers.get("RT-UDDOKTAPAY-API-KEY")):
                raise HTTPException(401, "Invalid API key")
            verified = await payment.verify_uddokta_payment(str(data["invoice_id"]))
            tx_id = uuid.UUID(str(verified["metadata"]["tran_id"]))
            amount = Decimal(str(verified["amount"]))
            gw_status = {"COMPLETED": "COMPLETED", "PENDING": "PENDING"}.get(str(verified.get("status")).upper(), "FAILED")
            if gw_status == "PENDING":
                return {"status": "pending"}  # not final yet; the gateway will call again
            data = {**verified, "gateway_tx_id": verified.get("transaction_id") or verified.get("invoice_id")}
        else:
            if not payment.verify_signature(raw, request.headers.get("X-Signature")):
                raise HTTPException(401, "Invalid signature")
            tx_id = uuid.UUID(str(data["tran_id"]))
            amount = Decimal(str(data["amount"]))
            gw_status = str(data["status"]).upper()
    except payment.GatewayError:
        raise HTTPException(502, "Could not verify payment with the gateway")
    except (ValueError, KeyError, TypeError, InvalidOperation, json.JSONDecodeError):
        raise HTTPException(400, "Malformed payload")

    tx = await db.scalar(select(Transaction).where(Transaction.id == tx_id).with_for_update())
    if tx is None:
        raise HTTPException(404, "Unknown transaction")
    if tx.status != TxStatus.initiated:
        return {"status": "already_processed"}  # idempotent: gateways retry IPNs

    order = await db.scalar(
        select(Order).where(Order.id == tx.order_id).options(selectinload(Order.items), selectinload(Order.user)).with_for_update()
    )

    if gw_status in SUCCESS:
        if amount != tx.amount:  # never trust a payment that doesn't match what we asked for
            tx.status = TxStatus.failed
            tx.raw_payload = data
            order.payment_status = PaymentStatus.failed
            await db.commit()
            raise HTTPException(400, "Amount mismatch")
        tx.status = TxStatus.success
        tx.paid_at = now()
        tx.gateway_tx_id = data.get("gateway_tx_id")
        order.payment_status = PaymentStatus.paid
        if order.order_status in (OrderStatus.awaiting_payment, OrderStatus.pending):
            order.order_status = OrderStatus.confirmed
        notify = True
    else:
        tx.status = TxStatus.cancelled if gw_status in CANCELLED else TxStatus.failed
        order.payment_status = PaymentStatus.failed
        if order.order_status in (OrderStatus.awaiting_payment, OrderStatus.pending):
            await cancel_order(db, order)  # give the reserved stock back
        notify = False
    tx.raw_payload = data
    await db.commit()

    if notify:
        tasks.add_task(
            notify_order_placed, order.shipping_phone, order.user.email, order.order_number, str(order.total_amount), True
        )
    return {"status": "ok"}


@router.get("/return/{outcome}")
async def browser_return(outcome: str):
    """Where the gateway sends the customer's browser. Display-only: it never changes order state."""
    if outcome not in ("success", "failed", "cancelled"):
        raise HTTPException(404)
    return RedirectResponse(f"{settings.frontend_url}/checkout/result?outcome={outcome}", status_code=303)
