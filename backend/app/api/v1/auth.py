import uuid
from datetime import timedelta

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.ratelimit import rate_limit
from app.api.deps import Principal, get_principal
from app.models import AuthProvider, OtpCode, RefreshToken, Role, User
from app.schemas import ChangePasswordIn, LoginIn, OtpRequestIn, RefreshIn, RegisterIn, TokenOut, UserOut, normalize_phone
from app.core.security import (
    create_access_token, generate_otp, hash_password, new_refresh_token, now, sha256, verify_password,
)
from app.services.sms import send_sms

router = APIRouter(prefix="/auth", tags=["auth"])

OTP_TTL = timedelta(minutes=5)
OTP_RESEND_GAP = timedelta(seconds=60)
OTP_MAX_ATTEMPTS = 5
DUMMY_HASH = hash_password("timing-equalizer")
BAD_CREDS = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")


async def issue_tokens(db: AsyncSession, user: User, login_method: AuthProvider, family: uuid.UUID | None = None) -> TokenOut:
    token, token_hash = new_refresh_token()
    db.add(RefreshToken(
        user_id=user.id,
        family_id=family or uuid.uuid4(),
        login_method=login_method,
        token_hash=token_hash,
        expires_at=now() + timedelta(days=settings.refresh_token_days),
    ))
    await db.commit()
    return TokenOut(access_token=create_access_token(user.id, user.role.value, login_method.value), refresh_token=token)


@router.post("/register", response_model=TokenOut, status_code=201, dependencies=[Depends(rate_limit("register", 10, 60))])
async def register(body: RegisterIn, db: AsyncSession = Depends(get_db)):
    user = User(
        name=body.name, email=body.email.lower(), password_hash=hash_password(body.password),
        auth_provider=AuthProvider.email, role=Role.customer,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    return await issue_tokens(db, user, AuthProvider.email)


@router.post("/otp/request", status_code=202, dependencies=[Depends(rate_limit("otp", 6, 60))])
async def request_otp(body: OtpRequestIn, tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    last = await db.scalar(
        select(OtpCode).where(OtpCode.phone == body.phone).order_by(OtpCode.created_at.desc()).limit(1)
    )
    if last and now() - last.created_at < OTP_RESEND_GAP:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Please wait a minute before requesting another code")
    code = generate_otp()
    db.add(OtpCode(phone=body.phone, code_hash=sha256(f"{body.phone}:{code}"), expires_at=now() + OTP_TTL))
    await db.commit()
    tasks.add_task(send_sms, body.phone, f"Your Zylora verification code is {code}. Valid for 5 minutes.")
    return {"detail": "Code sent"}


async def _login_email(body: LoginIn, db: AsyncSession) -> User:
    if not body.email or not body.password:
        raise HTTPException(422, "email and password are required")
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    # Always run a bcrypt compare so timing doesn't reveal whether the email exists.
    ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if not user or not ok:
        raise BAD_CREDS
    return user


async def _login_phone(body: LoginIn, db: AsyncSession) -> User:
    if not body.phone or not body.otp:
        raise HTTPException(422, "phone and otp are required")
    try:
        phone = normalize_phone(body.phone)
    except ValueError as e:
        raise HTTPException(422, str(e))
    otp = await db.scalar(
        select(OtpCode).where(OtpCode.phone == phone, OtpCode.consumed_at.is_(None))
        .order_by(OtpCode.created_at.desc()).limit(1).with_for_update()
    )
    if not otp or otp.expires_at < now() or otp.attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Code expired or invalid. Request a new one.")
    if sha256(f"{phone}:{body.otp}") != otp.code_hash:
        otp.attempts += 1
        await db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect code")
    otp.consumed_at = now()
    user = await db.scalar(select(User).where(User.phone == phone))
    if user is None:
        user = User(name=body.name or phone, phone=phone, auth_provider=AuthProvider.phone, role=Role.customer)
        db.add(user)
        await db.flush()
    return user


async def _login_facebook(body: LoginIn, db: AsyncSession) -> User:
    if not body.facebook_access_token:
        raise HTTPException(422, "facebook_access_token is required")
    if not settings.facebook_app_id or not settings.facebook_app_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Facebook login is not configured")
    app_token = f"{settings.facebook_app_id}|{settings.facebook_app_secret}"
    async with httpx.AsyncClient(timeout=10) as client:
        dbg = await client.get(
            "https://graph.facebook.com/debug_token",
            params={"input_token": body.facebook_access_token, "access_token": app_token},
        )
        data = dbg.json().get("data", {}) if dbg.status_code == 200 else {}
        # The token must be valid AND issued for *our* app, or anyone's token from another app would work.
        if not data.get("is_valid") or data.get("app_id") != settings.facebook_app_id:
            raise BAD_CREDS
        me = await client.get(
            "https://graph.facebook.com/me",
            params={"fields": "id,name,email", "access_token": body.facebook_access_token},
        )
        if me.status_code != 200:
            raise BAD_CREDS
        profile = me.json()
    fb_id = profile["id"]
    user = await db.scalar(select(User).where(User.facebook_id == fb_id))
    if user is None:
        user = User(
            name=profile.get("name") or "Facebook user", facebook_id=fb_id,
            email=None, auth_provider=AuthProvider.facebook, role=Role.customer,
        )
        db.add(user)
        await db.flush()
    return user


async def _login_google(body: LoginIn, db: AsyncSession) -> User:
    if not body.google_id_token:
        raise HTTPException(422, "google_id_token is required")
    if not settings.google_client_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google sign-in is not configured")
    # Google validates the signature and expiry; we still check who the token was issued for.
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": body.google_id_token})
    claims = resp.json() if resp.status_code == 200 else {}
    # The token must be issued for *our* client id, or a token minted for any other Google app would work.
    if claims.get("aud") != settings.google_client_id or claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise BAD_CREDS
    email = (claims.get("email") or "").lower()
    if not email or str(claims.get("email_verified")).lower() != "true":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your Google email address is not verified")
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            name=claims.get("name") or email.split("@")[0], email=email, password_hash=None,
            auth_provider=AuthProvider.google, role=Role.customer,
        )
        db.add(user)
        try:
            await db.flush()
        except IntegrityError:  # two first-time sign-ins racing: use the row the other request created
            await db.rollback()
            user = await db.scalar(select(User).where(User.email == email))
    elif user.role == Role.admin:
        # An admin account is only ever entered with its password.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin accounts must sign in with email and password")
    return user


@router.post("/login", response_model=TokenOut, dependencies=[Depends(rate_limit("login", 15, 60))])
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)):
    handler = {
        AuthProvider.email: _login_email,
        AuthProvider.phone: _login_phone,
        AuthProvider.facebook: _login_facebook,
        AuthProvider.google: _login_google,
    }[body.method]
    user = await handler(body, db)
    return await issue_tokens(db, user, body.method)


@router.post("/refresh", response_model=TokenOut)
async def refresh(body: RefreshIn, db: AsyncSession = Depends(get_db)):
    row = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == sha256(body.refresh_token)).with_for_update()
    )
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    if row.revoked_at is not None:
        # A rotated token was replayed: assume theft and kill the whole session family.
        await db.execute(
            update(RefreshToken).where(RefreshToken.family_id == row.family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now())
        )
        await db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token reuse detected; please log in again")
    if row.expires_at < now():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token expired")
    user = await db.get(User, row.user_id)
    row.revoked_at = now()
    return await issue_tokens(db, user, row.login_method, family=row.family_id)


@router.post("/logout", status_code=204)
async def logout(body: RefreshIn, db: AsyncSession = Depends(get_db)):
    row = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == sha256(body.refresh_token)))
    if row:
        await db.execute(
            update(RefreshToken).where(RefreshToken.family_id == row.family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now())
        )
        await db.commit()


@router.get("/me", response_model=UserOut)
async def me(principal: Principal = Depends(get_principal)):
    return principal.user


@router.post("/change-password", response_model=TokenOut, dependencies=[Depends(rate_limit("change-password", 10, 60))])
async def change_password(body: ChangePasswordIn, principal: Principal = Depends(get_principal), db: AsyncSession = Depends(get_db)):
    """Change the signed-in user's own password. Every other session is signed out; this one gets fresh tokens."""
    user = principal.user
    # 400 (not 401): the session itself is fine, only the typed password is wrong, so clients must not try to refresh.
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    if body.new_password == body.current_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "New password must be different from the current one")
    user.password_hash = hash_password(body.new_password)
    await db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).values(revoked_at=now()))
    return await issue_tokens(db, user, AuthProvider(principal.login_method))
