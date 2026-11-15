"""Supabase Auth bridge.

* verify_token(): checks a Supabase access token by asking GoTrue itself (GET /auth/v1/user), so no JWT
  secret is needed here and revoked sessions stop working immediately. Results are cached for a minute.
* sync_user(): mirrors a public.users row (same id, same bcrypt hash) into auth.users / auth.identities so
  the person can sign in through Supabase with the password they already have. Best-effort: a failure is
  logged and never breaks the API request that triggered it.
"""
import hashlib
import logging
import time
import uuid
from dataclasses import dataclass

import httpx
import jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

log = logging.getLogger(__name__)

_CACHE_TTL = 60.0
_CACHE_MAX = 512
_cache: dict[str, tuple[float, "SupabaseIdentity | None"]] = {}


@dataclass(frozen=True)
class SupabaseIdentity:
    id: uuid.UUID
    email: str | None
    email_verified: bool
    name: str | None
    login_method: str  # 'email' (password) or 'google'


def _login_method(token: str) -> str:
    """Most recent sign-in method from the (already GoTrue-verified) token's `amr` claim."""
    try:
        amr = jwt.decode(token, options={"verify_signature": False}).get("amr") or []
        method = amr[0].get("method") if amr else None
    except (jwt.PyJWTError, AttributeError, IndexError):
        method = None
    return "email" if method in (None, "password", "otp", "magiclink") else "google"


async def verify_token(token: str) -> SupabaseIdentity | None:
    if not settings.supabase_auth_enabled:
        return None
    key = hashlib.sha256(token.encode()).hexdigest()
    hit = _cache.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    identity: SupabaseIdentity | None = None
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            r = await client.get(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                headers={"apikey": settings.supabase_publishable_key, "Authorization": f"Bearer {token}"},
            )
        if r.status_code == 200:
            u = r.json()
            meta = u.get("user_metadata") or {}
            identity = SupabaseIdentity(
                id=uuid.UUID(u["id"]),
                email=(u.get("email") or "").lower() or None,
                email_verified=bool(u.get("email_confirmed_at")),
                name=meta.get("name") or meta.get("full_name"),
                login_method=_login_method(token),
            )
        elif r.status_code >= 500:
            return None  # Supabase hiccup: do not cache
    except (httpx.HTTPError, ValueError, KeyError) as e:
        log.warning("supabase token check failed: %s", e)
        return None
    if len(_cache) >= _CACHE_MAX:
        _cache.clear()
    _cache[key] = (time.monotonic() + _CACHE_TTL, identity)
    return identity


# The same statements are used by Alembic revision 0005 for the one-time backfill.
SYNC_SQL = [
    """
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change)
    SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', lower(u.email),
        COALESCE(u.password_hash, ''), now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('name', u.name, 'email_verified', true),
        u.created_at, now(), '', '', '', ''
    FROM public.users u
    WHERE u.email IS NOT NULL AND (CAST(:uid AS uuid) IS NULL OR u.id = CAST(:uid AS uuid))
    ON CONFLICT DO NOTHING
    """,
    """
    UPDATE auth.users a SET encrypted_password = u.password_hash, updated_at = now()
    FROM public.users u
    WHERE a.id = u.id AND u.password_hash IS NOT NULL AND a.encrypted_password IS DISTINCT FROM u.password_hash
      AND (CAST(:uid AS uuid) IS NULL OR u.id = CAST(:uid AS uuid))
    """,
    """
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    SELECT u.id::text, u.id,
        jsonb_build_object('sub', u.id::text, 'email', lower(u.email), 'email_verified', true, 'phone_verified', false),
        'email', now(), now(), now()
    FROM public.users u
    WHERE u.email IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
      AND (CAST(:uid AS uuid) IS NULL OR u.id = CAST(:uid AS uuid))
    ON CONFLICT DO NOTHING
    """,
]


async def sync_user(db: AsyncSession, user_id: uuid.UUID, *, sign_out_everywhere: bool = False) -> None:
    """Mirror one user into Supabase Auth. Call after the public.users change is committed."""
    if not settings.supabase_auth_enabled:
        return
    try:
        for stmt in SYNC_SQL:
            await db.execute(text(stmt), {"uid": str(user_id)})
        if sign_out_everywhere:
            await db.execute(text("DELETE FROM auth.sessions WHERE user_id = CAST(:uid AS uuid)"), {"uid": str(user_id)})
        await db.commit()
        _cache.clear()
    except Exception:  # noqa: BLE001 - mirroring must never break the request
        await db.rollback()
        log.exception("could not mirror user %s into Supabase Auth", user_id)
