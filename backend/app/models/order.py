import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Index, Integer, Numeric, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models._common import _created, _uuid
from app.models.product import ProductVariant
from app.models.user import AuthProvider, User


class PaymentMethod(str, enum.Enum):
    cod = "cod"
    online = "online"


class PaymentStatus(str, enum.Enum):
    unpaid = "unpaid"
    pending = "pending"  # online payment started, awaiting gateway confirmation
    paid = "paid"
    failed = "failed"
    refunded = "refunded"


class OrderStatus(str, enum.Enum):
    pending = "pending"
    awaiting_payment = "awaiting_payment"
    confirmed = "confirmed"
    shipped = "shipped"
    delivered = "delivered"
    cancelled = "cancelled"


class DeliveryZone(str, enum.Enum):
    inside_dhaka = "inside_dhaka"
    outside_dhaka = "outside_dhaka"


class TxStatus(str, enum.Enum):
    initiated = "initiated"
    success = "success"
    failed = "failed"
    cancelled = "cancelled"


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[uuid.UUID] = _uuid()
    order_number: Mapped[str] = mapped_column(String(20), unique=True)  # customer-facing Order ID
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    shipping_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    payment_method: Mapped[PaymentMethod] = mapped_column(Enum(PaymentMethod, name="payment_method"), index=True)
    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"), default=PaymentStatus.unpaid, index=True
    )
    order_status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status"), default=OrderStatus.pending, index=True
    )
    # Attribution: how the order arrived
    login_method: Mapped[AuthProvider] = mapped_column(Enum(AuthProvider, name="auth_provider"))
    order_source: Mapped[str | None] = mapped_column(String(100), index=True)  # utm_source
    utm: Mapped[dict | None] = mapped_column(JSONB)  # full utm_* / referrer payload
    # Shipping
    recipient_name: Mapped[str] = mapped_column(String(120))
    shipping_phone: Mapped[str] = mapped_column(String(20))
    shipping_address: Mapped[str] = mapped_column(Text)
    delivery_zone: Mapped[DeliveryZone] = mapped_column(Enum(DeliveryZone, name="delivery_zone"))
    stock_released: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="order")
    user: Mapped[User] = relationship()
    __table_args__ = (
        # Admin dashboard filters: status + payment mode + traffic source, newest first
        Index("ix_orders_admin_filter", "order_status", "payment_method", "order_source", "created_at"),
    )


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[uuid.UUID] = _uuid()
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    variant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("product_variants.id"))
    product_title: Mapped[str] = mapped_column(String(200))  # snapshot
    size: Mapped[str] = mapped_column(String(20))  # snapshot
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    order: Mapped[Order] = relationship(back_populates="items")
    variant: Mapped[ProductVariant] = relationship()
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_item_qty"),)


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[uuid.UUID] = _uuid()
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    gateway_tx_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    provider: Mapped[str] = mapped_column(String(30))  # bkash / nagad / card
    status: Mapped[TxStatus] = mapped_column(Enum(TxStatus, name="tx_status"), default=TxStatus.initiated)
    raw_payload: Mapped[dict | None] = mapped_column(JSONB)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()
    order: Mapped[Order] = relationship(back_populates="transactions")
