import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import AuthProvider, DeliveryZone, OrderStatus, PaymentMethod, PaymentStatus, Role, TxStatus
from app.schemas.common import ORM, normalize_phone


class VariantOut(ORM):
    id: uuid.UUID
    size: str
    sku: str
    stock_quantity: int
    in_stock: bool = False
    low_stock: bool = False


class ProductOut(ORM):
    id: uuid.UUID
    title: str
    slug: str
    category: str
    base_price: Decimal
    discount_percent: Decimal
    final_price: Decimal
    images: list[str]
    video_url: str | None
    is_active: bool
    in_stock: bool


class ProductDetailOut(ProductOut):
    description: str
    variants: list[VariantOut]


class ProductListOut(BaseModel):
    items: list[ProductDetailOut]
    total: int
    page: int
    page_size: int


class VariantIn(BaseModel):
    size: str = Field(min_length=1, max_length=20)
    stock_quantity: int = Field(ge=0)
    sku: str | None = Field(default=None, max_length=80)


class ProductIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    category: str = Field(min_length=1, max_length=80)
    base_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    discount_percent: Decimal = Field(default=Decimal(0), ge=0, le=100)
    video_url: str | None = None
    images: list[str] = []
    is_active: bool = True
    variants: list[VariantIn] = []


class ProductPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    category: str | None = None
    base_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    discount_percent: Decimal | None = Field(default=None, ge=0, le=100)
    video_url: str | None = None
    images: list[str] | None = None
    is_active: bool | None = None
    variants: list[VariantIn] | None = None  # upsert by size; stock set to the given value
