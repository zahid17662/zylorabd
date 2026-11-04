"""Local Bangladeshi bulk-SMS gateway client (phone OTP + order texts). Never raises."""
import logging

import httpx

from app.core.config import settings

log = logging.getLogger("zylora.sms")


async def send_sms(phone: str, message: str) -> None:
    if not settings.sms_api_url:
        log.warning("SMS gateway not configured; would send to %s: %s", phone, message)
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Adapt the payload to your local bulk SMS provider (BulkSMSBD, Alpha SMS, ...).
            r = await client.post(
                settings.sms_api_url,
                json={
                    "api_key": settings.sms_api_key,
                    "senderid": settings.sms_sender_id,
                    "number": f"88{phone}",
                    "message": message,
                },
            )
            r.raise_for_status()
    except Exception:
        log.exception("SMS send failed for %s", phone)
