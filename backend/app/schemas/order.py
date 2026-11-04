import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import AuthProvider, DeliveryZone, OrderStatus, PaymentMethod, PaymentStatus, Role, TxStatus
from app.schemas.common import ORM, normalize_phone


class CartLine(BaseModel):
    variant_id: uuid.UUID
    quantity: int = Field(ge=1, le=20)


class ShippingIn(BaseModel):
    recipient_name: str = Field(min_length=1, max_length=120)
    phone: str
    address: str = Field(min_length=5, max_length=500)
    zone: DeliveryZone

    @field_validator("phone")
    @classmethod
    def _norm(cls, v: str) -> str:
        return normalize_phone(v)


class Attribution(BaseModel):
    utm_source: str | None = Field(default=None, max_length=100)
    utm_medium: str | None = Field(default=None, max_length=100)
    utm_campaign: str | None = Field(default=None, max_length=150)
    referrer: str | None = Field(default=None, max_length=300)


class CheckoutIn(BaseModel):
    items: list[CartLine] = Field(min_length=1, max_length=50)
    shipping: ShippingIn
    payment_method: PaymentMethod
    online_provider: Literal["bkash", "nagad", "card"] | None = None
    attribution: Attribution | None = None
    # NOTE: no prices/totals accepted here on purpose. They are computed server-side.


class OrderItemOut(ORM):
    product_title: str
    size: str
    quantity: int
    unit_price: Decimal


class OrderOut(ORM):
    id: uuid.UUID
    order_number: str
    subtotal: Decimal
    shipping_fee: Decimal
    total_amount: Decimal
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    order_status: OrderStatus
    delivery_zone: DeliveryZone
    recipient_name: str
    shipping_phone: str
    shipping_address: str
    created_at: datetime
    items: list[OrderItemOut]


class CheckoutOut(BaseModel):
    order: OrderOut
    payment_url: str | None = None  # present for online payments


class TransactionOut(ORM):
    gateway_tx_id: str | None
    amount: Decimal
    provider: str
    status: TxStatus
    paid_at: datetime | None


class AdminOrderOut(OrderOut):
    login_method: AuthProvider
    order_source: str | None
    utm: dict | None
    customer_name: str
    customer_email: str | None
    customer_phone: str | None
    transactions: list[TransactionOut]


class AdminOrderListOut(BaseModel):
    items: list[AdminOrderOut]
    total: int
    page: int
    page_size: int


class StatusUpdateIn(BaseModel):
    status: OrderStatus


class DashboardOut(BaseModel):
    total_orders: int
    pending_orders: int
    todays_orders: int
    todays_sales: Decimal
    total_revenue: Decimal
    cod_orders: int = 0
    online_orders: int = 0
    cod_revenue: Decimal = Decimal(0)
    online_revenue: Decimal = Decimal(0)


class SplitRow(BaseModel):
    key: str  # e.g. "COD", "NAGAD", "FACEBOOK", "FB_AD"
    orders: int  # non-cancelled orders
    revenue: Decimal  # paid, non-cancelled revenue


class AttributionSplit(BaseModel):
    login_channel: list[SplitRow]
    order_source: list[SplitRow]


class LowStockVariantOut(BaseModel):
    product_id: uuid.UUID
    product_title: str
    variant_id: uuid.UUID
    size: str
    sku: str
    stock_quantity: int


class StatsOut(BaseModel):
    total_orders: int
    pending_orders: int  # pending + awaiting_payment
    confirmed_orders: int
    pending_fulfillment: int  # everything accepted but not yet shipped
    shipped_orders: int
    delivered_orders: int
    cancelled_orders: int
    total_revenue: Decimal  # payment_status == paid and order_status != cancelled
    payment_method_split: list[SplitRow]
    order_attribution_split: AttributionSplit
    low_stock_variants: list[LowStockVariantOut]
