"""Payment gateway adapter (SSLCommerz / UddoktaPay / PortPos style).

The webhook signature scheme here is HMAC-SHA256 over the raw request body, sent in `X-Signature`.
When wiring a real gateway, replace `build_payment_url` with its "init session" API call and
`verify_signature` with that gateway's IPN verification (e.g. SSLCommerz val_id validation).
"""
import hashlib
import hmac
from urllib.parse import urlencode

from app.core.config import settings


def sign(body: bytes) -> str:
    return hmac.new(settings.payment_webhook_secret.encode(), body, hashlib.sha256).hexdigest()


def verify_signature(body: bytes, signature: str | None) -> bool:
    if not signature:
        return False
    return hmac.compare_digest(sign(body), signature.strip().lower())


def build_payment_url(tx_id: str, amount: str, provider: str) -> str:
    base = settings.payment_gateway_base_url or f"{settings.frontend_url}/pay/sandbox"
    query = urlencode({
        "tran_id": tx_id,
        "amount": amount,
        "currency": "BDT",
        "provider": provider,
        "success_url": f"{settings.public_api_url}/api/v1/payments/return/success",
        "fail_url": f"{settings.public_api_url}/api/v1/payments/return/failed",
        "cancel_url": f"{settings.public_api_url}/api/v1/payments/return/cancelled",
        "ipn_url": f"{settings.public_api_url}/api/v1/payments/webhook",
    })
    return f"{base}?{query}"


# ---------------- UddoktaPay ----------------
import httpx  # noqa: E402


class GatewayError(Exception):
    pass


def _headers() -> dict:
    return {"RT-UDDOKTAPAY-API-KEY": settings.payment_gateway_api_key, "Accept": "application/json",
            "Content-Type": "application/json"}


def verify_uddokta_header(value: str | None) -> bool:
    """UddoktaPay calls our webhook with our API key in this header."""
    return bool(value) and hmac.compare_digest(value, settings.payment_gateway_api_key)


async def create_uddokta_charge(tx_id: str, amount: str, name: str, email: str | None, phone: str | None) -> str:
    """Create a hosted checkout and return the URL to redirect the customer to."""
    body = {
        "full_name": name,
        "email": email or f"{phone or 'customer'}@no-email.invalid",
        "amount": amount,
        "metadata": {"tran_id": tx_id},
        "redirect_url": f"{settings.public_api_url}/api/v1/payments/return/success",
        "cancel_url": f"{settings.public_api_url}/api/v1/payments/return/cancelled",
        "webhook_url": f"{settings.public_api_url}/api/v1/payments/webhook",
        "return_type": "GET",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"{settings.payment_gateway_base_url.rstrip('/')}/api/checkout-v2", json=body, headers=_headers())
            data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise GatewayError("Payment gateway unreachable") from e
    if r.status_code != 200 or not data.get("payment_url"):
        raise GatewayError(data.get("message") or "Payment gateway rejected the request")
    return data["payment_url"]


async def verify_uddokta_payment(invoice_id: str) -> dict:
    """Server-to-server check of an invoice. The webhook body itself is never trusted."""
    url = settings.payment_verify_url or f"{settings.payment_gateway_base_url.rstrip('/')}/api/verify-payment"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(url, json={"invoice_id": invoice_id}, headers=_headers())
            return r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise GatewayError("Could not verify payment") from e
