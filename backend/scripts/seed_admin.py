"""Create or promote the initial admin user. Safe to run on every deploy.

    cd backend && python -m scripts.seed_admin

Reads ADMIN_EMAIL, ADMIN_PASSWORD and (optionally) ADMIN_PHONE from the environment, falling back to
backend/.env. Real environment variables win over .env, as on a hosting platform.

Rules (so re-running can never lock someone out or change a live admin's credentials):
  * no matching user      -> create an admin
  * matching user         -> promote to admin; fill in a missing email / phone / password only
  * existing password / phone / email are never overwritten
  * email and phone that belong to two different users -> refuse
"""
import asyncio
import os
import re
import sys
from pathlib import Path
from typing import Literal

from dotenv import dotenv_values
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models import AuthProvider, Role, User  # noqa: E402
from app.schemas.common import normalize_phone  # noqa: E402

MIN_PASSWORD_LENGTH = 8  # same floor as customer registration
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

Outcome = Literal["created", "promoted", "updated", "unchanged"]


class SeedError(Exception):
    """Bad input or an ambiguous existing account; nothing was written."""


def _validate(email: str, phone: str | None, password: str) -> tuple[str, str | None]:
    email = (email or "").strip().lower()
    if not EMAIL.match(email):
        raise SeedError("ADMIN_EMAIL must be a valid email address")
    if len(password or "") < MIN_PASSWORD_LENGTH:
        raise SeedError(f"ADMIN_PASSWORD must be at least {MIN_PASSWORD_LENGTH} characters")
    try:
        return email, normalize_phone(phone) if phone and phone.strip() else None
    except ValueError as e:
        raise SeedError(f"ADMIN_PHONE: {e}") from e


async def seed_admin(db: AsyncSession, email: str, phone: str | None, password: str) -> Outcome:
    email, phone = _validate(email, phone, password)
    by_email = await db.scalar(select(User).where(User.email == email))
    by_phone = await db.scalar(select(User).where(User.phone == phone)) if phone else None
    if by_email and by_phone and by_email.id != by_phone.id:
        raise SeedError("ADMIN_EMAIL and ADMIN_PHONE belong to two different accounts; fix one of them")

    user = by_email or by_phone
    if user is None:
        db.add(User(
            name="Admin", email=email, phone=phone, password_hash=hash_password(password),
            auth_provider=AuthProvider.email, role=Role.admin,
        ))
        try:
            await db.commit()
        except IntegrityError as e:  # a concurrent run created the same user first
            await db.rollback()
            raise SeedError("The admin account was created by another run at the same time; run the script again") from e
        return "created"

    promoted = user.role != Role.admin
    filled = False
    if promoted:
        user.role = Role.admin
    if user.email is None:
        user.email, filled = email, True
    if phone and user.phone is None:
        user.phone, filled = phone, True
    if user.password_hash is None:
        user.password_hash, filled = hash_password(password), True
    if promoted or filled:
        await db.commit()
    return "promoted" if promoted else "updated" if filled else "unchanged"


async def main() -> int:
    env = {**dotenv_values(ROOT / ".env"), **os.environ}
    email, phone, password = env.get("ADMIN_EMAIL"), env.get("ADMIN_PHONE"), env.get("ADMIN_PASSWORD")
    if not email or not password:
        print("ADMIN_EMAIL and ADMIN_PASSWORD must be set (in the environment or backend/.env).", file=sys.stderr)
        return 1
    try:
        async with SessionLocal() as db:
            outcome = await seed_admin(db, email, phone, password)
    except SeedError as e:
        print(f"Admin seed failed: {e}", file=sys.stderr)
        return 1
    print(f"Admin {outcome}: {email.strip().lower()}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
