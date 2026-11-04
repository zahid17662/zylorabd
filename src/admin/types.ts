export type User = { id: string; name: string; email: string | null; role: string }

export type OrderStatus = 'pending' | 'awaiting_payment' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded'

export type Transaction = {
  provider: string
  status: string
  gateway_tx_id: string | null
  amount: string
  paid_at: string | null
}

export type OrderItem = { product_title: string; size: string; quantity: number; unit_price: string }

export type Order = {
  id: string
  order_number: string
  subtotal: string
  total_amount: string
  shipping_fee: string
  payment_method: 'cod' | 'online'
  payment_status: PaymentStatus
  order_status: OrderStatus
  login_method: 'email' | 'phone' | 'facebook'
  order_source: string | null
  utm: Record<string, string> | null
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  recipient_name: string
  shipping_phone: string
  shipping_address: string
  delivery_zone: string
  created_at: string
  items: OrderItem[]
  transactions: Transaction[]
}

export type Variant = { id?: string; size: string; sku?: string; stock_quantity: number }

export type Product = {
  id: string
  title: string
  description: string
  category: string
  base_price: string
  discount_percent: string
  final_price: string
  images: string[]
  video_url: string | null
  is_active: boolean
  total_stock: number
  variants: Variant[]
}

export type SplitRow = { key: string; orders: number; revenue: string }
export type LowStock = {
  product_id: string
  product_title: string
  variant_id: string
  size: string
  sku: string
  stock_quantity: number
}
export type Stats = {
  total_orders: number
  pending_orders: number
  confirmed_orders: number
  pending_fulfillment: number
  shipped_orders: number
  delivered_orders: number
  cancelled_orders: number
  total_revenue: string
  payment_method_split: SplitRow[]
  order_attribution_split: { login_channel: SplitRow[]; order_source: SplitRow[] }
  low_stock_variants: LowStock[]
}

/** Allowed next steps; mirrors the TRANSITIONS table the API enforces. */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  awaiting_payment: ['cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}
