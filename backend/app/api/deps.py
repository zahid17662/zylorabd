import uuid
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import AuthProvider, Role, User
from app.core.config import settings
from app.core.security import decode_access_token
from app.services import supabase_auth

bearer = HTTPBearer(auto_error=False)


@dataclass
class Principal:
    user: User
    login_method: str


async def _principal_from_supabase(token: str, db: AsyncSession) -> Principal | None:
    ident = await supabase_auth.verify_token(token)
    if ident is None:
        return None
    user = await db.get(User, ident.id)
    if user is None:
        # First sight of a Supabase-only account: create a customer row. Only for a verified email, and never
        # by linking to an existing row with the same email (anyone can start a Supabase sign-up with any email).
        if not (ident.email and ident.email_verified):
            return None
        if await db.scalar(select(User.id).where(User.email == ident.email)) is not None:
            return None
        user = User(
            id=ident.id, name=ident.name or ident.email.split("@")[0], email=ident.email, password_hash=None,
            auth_provider=AuthProvider.google if ident.login_method == "google" else AuthProvider.email,
            role=Role.customer,
        )
        db.add(user)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            user = await db.get(User, ident.id)
            if user is None:
                return None
    return Principal(user=user, login_method=ident.login_method)


async def get_principal(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> Principal:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = decode_access_token(creds.credentials)
        user = await db.get(User, uuid.UUID(payload["sub"]))
    except (jwt.PyJWTError, ValueError, KeyError):
        # Not one of our own tokens: it may be a Supabase Auth access token.
        principal = await _principal_from_supabase(creds.credentials, db) if settings.supabase_auth_enabled else None
        if principal is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
        return principal
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return Principal(user=user, login_method=payload.get("lm", user.auth_provider.value))


async def require_admin(principal: Principal = Depends(get_principal)) -> User:
    if principal.user.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    if principal.login_method not in ("email", "otp"):
        # Same rule as /auth/login: an admin account is only ever entered with its password.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin accounts must sign in with email and password")
    return principal.user
