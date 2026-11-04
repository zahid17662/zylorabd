import json

from conftest import auth_headers, checkout_body
from sqlalchemy import select

from app.models import Order, ProductVariant, Transaction
from app.services import payment


async def place_online_order(client, sessions, make_user, make_product, stock=4):
    user = await make_user()
    product = await make_product({"M": stock})
    vid = product.variants[0].id
    r = await client.post("/api/v1/orders/checkout", json=checkout_body(vid, method="online"), headers=auth_headers(user))
    assert r.status_code == 201, r.text
    order = r.json()["order"]
    async with sessions() as s:
        tx = await s.scalar(select(Transaction).where(Transaction.order_id == order["id"]))
    return order, tx, vid


def signed(payload: dict) -> tuple[bytes, dict]:
    raw = json.dumps(payload).encode()
    return raw, {"X-Signature": payment.sign(raw), "Content-Type": "application/json"}


async def order_row(sessions, order_id) -> Order:
    async with sessions() as s:
        return await s.scalar(select(Order).where(Order.id == order_id))


async def stock_of(sessions, vid) -> int:
    async with sessions() as s:
        return await s.scalar(select(ProductVariant.stock_quantity).where(ProductVariant.id == vid))


async def test_valid_webhook_marks_order_paid_and_confirmed(client, sessions, make_user, make_product):
    order, tx, vid = await place_online_order(client, sessions, make_user, make_product)
    raw, headers = signed({"tran_id": str(tx.id), "amount": order["total_amount"], "status": "COMPLETED", "gateway_tx_id": "BKX1"})
    r = await client.post("/api/v1/payments/webhook", content=raw, headers=headers)
    assert r.status_code == 200 and r.json()["status"] == "ok"
    row = await order_row(sessions, order["id"])
    assert row.payment_status.value == "paid" and row.order_status.value == "confirmed"
    assert await stock_of(sessions, vid) == 3  # stays deducted


async def test_webhook_replay_is_idempotent(client, sessions, make_user, make_product):
    order, tx, _ = await place_online_order(client, sessions, make_user, make_product)
    raw, headers = signed({"tran_id": str(tx.id), "amount": order["total_amount"], "status": "COMPLETED"})
    first = await client.post("/api/v1/payments/webhook", content=raw, headers=headers)
    second = await client.post("/api/v1/payments/webhook", content=raw, headers=headers)
    assert first.json()["status"] == "ok"
    assert second.status_code == 200 and second.json()["status"] == "already_processed"
    assert (await order_row(sessions, order["id"])).payment_status.value == "paid"


async def test_bad_signature_is_rejected_and_changes_nothing(client, sessions, make_user, make_product):
    order, tx, _ = await place_online_order(client, sessions, make_user, make_product)
    raw = json.dumps({"tran_id": str(tx.id), "amount": order["total_amount"], "status": "COMPLETED"}).encode()
    r = await client.post("/api/v1/payments/webhook", content=raw, headers={"X-Signature": "0" * 64})
    assert r.status_code == 401
    r = await client.post("/api/v1/payments/webhook", content=raw)  # no signature at all
    assert r.status_code == 401
    assert (await order_row(sessions, order["id"])).payment_status.value == "pending"


async def test_amount_mismatch_is_not_accepted_as_paid(client, sessions, make_user, make_product):
    order, tx, _ = await place_online_order(client, sessions, make_user, make_product)
    raw, headers = signed({"tran_id": str(tx.id), "amount": "1.00", "status": "COMPLETED"})
    r = await client.post("/api/v1/payments/webhook", content=raw, headers=headers)
    assert r.status_code == 400
    assert (await order_row(sessions, order["id"])).payment_status.value != "paid"


async def test_failed_payment_cancels_order_and_restores_stock_once(client, sessions, make_user, make_product):
    order, tx, vid = await place_online_order(client, sessions, make_user, make_product, stock=4)
    assert await stock_of(sessions, vid) == 3
    raw, headers = signed({"tran_id": str(tx.id), "amount": order["total_amount"], "status": "FAILED"})
    r = await client.post("/api/v1/payments/webhook", content=raw, headers=headers)
    assert r.status_code == 200
    row = await order_row(sessions, order["id"])
    assert row.order_status.value == "cancelled" and row.payment_status.value == "failed"
    assert await stock_of(sessions, vid) == 4
    # gateway retries the same failure: stock must not be added again
    again = await client.post("/api/v1/payments/webhook", content=raw, headers=headers)
    assert again.json()["status"] == "already_processed"
    assert await stock_of(sessions, vid) == 4


async def test_cancelled_payment_also_restores_stock(client, sessions, make_user, make_product):
    order, tx, vid = await place_online_order(client, sessions, make_user, make_product, stock=2)
    raw, headers = signed({"tran_id": str(tx.id), "amount": order["total_amount"], "status": "CANCELLED"})
    assert (await client.post("/api/v1/payments/webhook", content=raw, headers=headers)).status_code == 200
    assert await stock_of(sessions, vid) == 2
    assert (await order_row(sessions, order["id"])).order_status.value == "cancelled"


async def test_late_failure_cannot_undo_a_paid_order(client, sessions, make_user, make_product):
    order, tx, vid = await place_online_order(client, sessions, make_user, make_product)
    ok, h1 = signed({"tran_id": str(tx.id), "amount": order["total_amount"], "status": "COMPLETED"})
    await client.post("/api/v1/payments/webhook", content=ok, headers=h1)
    bad, h2 = signed({"tran_id": str(tx.id), "amount": order["total_amount"], "status": "FAILED"})
    r = await client.post("/api/v1/payments/webhook", content=bad, headers=h2)
    assert r.json()["status"] == "already_processed"
    row = await order_row(sessions, order["id"])
    assert row.payment_status.value == "paid" and row.order_status.value == "confirmed"
    assert await stock_of(sessions, vid) == 3


async def test_unknown_transaction_and_malformed_body(client):
    raw, headers = signed({"tran_id": "00000000-0000-0000-0000-000000000000", "amount": "10", "status": "COMPLETED"})
    assert (await client.post("/api/v1/payments/webhook", content=raw, headers=headers)).status_code == 404
    raw2 = b"not json"
    h = {"X-Signature": payment.sign(raw2)}
    assert (await client.post("/api/v1/payments/webhook", content=raw2, headers=h)).status_code == 400
