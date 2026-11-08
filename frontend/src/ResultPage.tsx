import { CheckCircle2, XCircle } from 'lucide-react'

const COPY = {
  success: {
    icon: CheckCircle2,
    title: 'Payment received',
    text: 'Thank you! Your payment is being confirmed and your order will be processed shortly. We will text you when it ships.',
  },
  failed: {
    icon: XCircle,
    title: 'Payment failed',
    text: 'Your payment did not go through and you have not been charged. The items were released, so please place the order again or choose Cash on Delivery.',
  },
  cancelled: {
    icon: XCircle,
    title: 'Payment cancelled',
    text: 'You cancelled the payment. Your order was not placed. You can go back to the shop and try again.',
  },
} as const

type Outcome = keyof typeof COPY

/** Where the payment gateway sends the customer's browser. Display-only: the server decides the real status via webhook. */
export default function ResultPage() {
  const raw = new URLSearchParams(location.search).get('outcome') ?? ''
  const outcome: Outcome = raw in COPY ? (raw as Outcome) : 'failed'
  const { icon: Icon, title, text } = COPY[outcome]
  return (
    <main className="grid min-h-screen place-items-center bg-cream px-4">
      <div className="w-full max-w-[460px] bg-white p-10 text-center">
        <Icon className={`mx-auto size-12 ${outcome === 'success' ? 'text-ink' : 'text-wine'}`} strokeWidth={1} />
        <h1 className="mt-5 font-serif text-[32px]">{title}</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">{text}</p>
        <a href="/" className="mt-8 inline-block rounded-full bg-ink px-8 py-3.5 text-[14px] text-white hover:bg-black">
          Continue Shopping
        </a>
      </div>
    </main>
  )
}
