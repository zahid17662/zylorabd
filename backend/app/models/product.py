import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models._common import _created, _uuid


class Product(Base):
    __tablename__ = "products"
    id: Mapped[uuid.UUID] = _uuid()
    title: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(220), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(80), index=True)
    base_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    discount_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    video_url: Mapped[str | None] = mapped_column(String(500))
    images: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = _created()
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="ProductVariant.created_at"
    )
    __table_args__ = (
        CheckConstraint("base_price >= 0", name="ck_product_price"),
        CheckConstraint("discount_percent >= 0 AND discount_percent <= 100", name="ck_product_discount"),
    )

    @property
    def final_price(self) -> Decimal:
        return (self.base_price * (Decimal(100) - self.discount_percent) / Decimal(100)).quantize(Decimal("0.01"))


class ProductVariant(Base):
    __tablename__ = "product_variants"
    id: Mapped[uuid.UUID] = _uuid()
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    size: Mapped[str] = mapped_column(String(20))
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0)
    sku: Mapped[str] = mapped_column(String(80), unique=True)
    created_at: Mapped[datetime] = _created()
    product: Mapped[Product] = relationship(back_populates="variants")
    __table_args__ = (
        UniqueConstraint("product_id", "size", name="uq_variant_product_size"),
        CheckConstraint("stock_quantity >= 0", name="ck_variant_stock"),
    )
