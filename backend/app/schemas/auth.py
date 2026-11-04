import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import AuthProvider, DeliveryZone, OrderStatus, PaymentMethod, PaymentStatus, Role, TxStatus
from app.schemas.common import ORM, normalize_phone


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class OtpRequestIn(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def _norm(cls, v: str) -> str:
        return normalize_phone(v)


class LoginIn(BaseModel):
    method: AuthProvider
    email: EmailStr | None = None
    password: str | None = None
    phone: str | None = None
    otp: str | None = Field(default=None, min_length=6, max_length=6)
    name: str | None = Field(default=None, max_length=120)  # used when a phone/FB account is first created
    facebook_access_token: str | None = None


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(ORM):
    id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    auth_provider: AuthProvider
    role: Role
