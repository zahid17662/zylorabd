"""SMS / email notifications. Failures are logged, never raised: they must not break an order."""
import logging

from app.services.sms import send_sms

log = logging.getLogger("zylora.notify")


async def send_email(to: str, subject: str, body: str) -> None:
    # Plug in SMTP / SES / Resend here.
    log.info("EMAIL to=%s subject=%s", to, subject)


async def notify_order_placed(phone: str, email: str | None, order_number: str, total: str, paid: bool) -> None:
    state = "payment received" if paid else "placed"
    await send_sms(phone, f"Zylora: your order {order_number} is {state}. Total: BDT {total}. Thank you!")
    if email:
        await send_email(email, f"Order {order_number} confirmed", f"Your order {order_number} ({total} BDT) is {state}.")
