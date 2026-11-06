import { useState } from 'react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { Logo } from './Logo'

const COLUMNS = {
  Help: ['+880 1700-000000', 'WhatsApp Us', 'FAQ', 'Track Your Order', 'Size Guide', 'Shipping & Delivery'],
  Services: ['Cash on Delivery', 'bKash & Nagad', '7-Day Exchange', 'Personal Styling', 'Gift Wrapping'],
  'About Zylora': ['About', 'Contact', 'Shop', 'Cart', 'Checkout', 'Blog'],
}

const SOCIAL = [
  { label: 'Facebook', path: 'M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3z' },
  {
    label: 'Instagram',
    path: 'M12 7.4A4.6 4.6 0 1 0 12 16.6 4.6 4.6 0 0 0 12 7.4Zm0 7.6a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm4.8-8.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2ZM12 3.6c-2.3 0-2.6 0-3.5.1-3.1.1-4.6 1.7-4.8 4.8-.1.9-.1 1.2-.1 3.5s0 2.6.1 3.5c.1 3.1 1.7 4.6 4.8 4.8.9.1 1.2.1 3.5.1s2.6 0 3.5-.1c3.1-.1 4.6-1.7 4.8-4.8.1-.9.1-1.2.1-3.5s0-2.6-.1-3.5c-.1-3.1-1.7-4.6-4.8-4.8-.9-.1-1.2-.1-3.5-.1Z',
  },
  { label: 'TikTok', path: 'M16.6 3c.4 2.2 1.8 3.7 4 4v3.1c-1.5 0-2.9-.4-4-1.2v6.3c0 3.4-2.5 5.8-5.8 5.8S5 18.6 5 15.3c0-3.4 2.8-5.9 6.3-5.6v3.2c-1.6-.3-3.1.8-3.1 2.4 0 1.4 1.1 2.5 2.5 2.5 1.5 0 2.6-1.1 2.6-2.9V3h3.3z' },
]

export function Footer() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)

  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-6 py-8 md:grid-cols-2 md:px-10 md:py-16 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.6fr)] lg:gap-12">
        {/* Mobile: collapsed accordions keep the footer short */}
        <div className="divide-y divide-line border-y border-line md:hidden">
          {Object.entries(COLUMNS).map(([title, links]) => (
            <details key={title} className="group">
              <summary className="caps flex cursor-pointer list-none items-center justify-between py-3.5 !text-[11px] [&::-webkit-details-marker]:hidden">
                {title}
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" strokeWidth={1.25} />
              </summary>
              <ul className="space-y-2.5 pb-4">
                {links.map((l) => (
                  <li key={l}>
                    <a href={l.startsWith('+') ? 'tel:+8801700000000' : '#top'} className="text-[13px] text-muted hover:text-ink">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>

        {Object.entries(COLUMNS).map(([title, links]) => (
          <div key={title} className="hidden md:block">
            <h3 className="caps !text-[11px]">{title}</h3>
            <ul className="mt-5 space-y-3">
              {links.map((l) => (
                <li key={l}>
                  <a href={l.startsWith('+') ? 'tel:+8801700000000' : '#top'} className="text-[14px] text-muted transition-colors hover:text-ink">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="md:col-span-2 lg:col-span-1">
          <h3 className="caps !text-[11px]">Email Sign-Up</h3>
          <p className="mt-3 text-[13px] text-muted md:mt-5 md:text-[14px]">
            Be the first to know about new collections, Eid launches and private sales.
          </p>
          {done ? (
            <p className="mt-5 text-[14px]">Thank you — you’re on the list.</p>
          ) : (
            <form
              className="mt-5 flex items-center border-b border-ink pb-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (email.includes('@')) setDone(true)
              }}
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                aria-label="Email address"
                className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted"
              />
              <button aria-label="Subscribe" className="p-1">
                <ArrowRight className="size-4" strokeWidth={1.25} />
              </button>
            </form>
          )}
          <h3 className="caps mt-6 !text-[11px] md:mt-10">Visit Our Boutique</h3>
          <iframe
            title="Zylora boutique location"
            src="https://www.google.com/maps?q=Gulshan%201%2C%20Dhaka&z=14&output=embed"
            width="100%"
            height="170"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="mt-4 hidden border-0 grayscale md:block"
          />
          <p className="mt-2 text-[13px] text-muted">
            <a
              href="https://www.google.com/maps?q=Gulshan%201%2C%20Dhaka"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 md:no-underline"
            >
              Gulshan 1, Dhaka
            </a>{' '}
            · Open daily 11am – 9pm
          </p>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 py-4 text-[12px] text-muted md:px-10 md:py-6 md:text-[13px]">
          <span>Ship to: Bangladesh (৳ BDT)</span>
          <div className="flex gap-6">
            {SOCIAL.map((s) => (
              <a key={s.label} href="#top" aria-label={s.label} className="text-ink transition-opacity hover:opacity-60">
                <svg viewBox="0 0 24 24" width="17" height="17" className="fill-current">
                  <path d={s.path} />
                </svg>
              </a>
            ))}
          </div>
          <span>Sitemap · Legal & Privacy · Cookies</span>
        </div>
      </div>

      <div className="overflow-hidden px-6 pt-2 pb-6 text-center md:pt-4 md:pb-10">
        <Logo className="block text-[10vw] leading-none md:text-[11vw]" />
        <p className="mt-4 md:mt-6text-[12px] text-muted">Copyright © {new Date().getFullYear()} Zylora. All rights reserved.</p>
      </div>
    </footer>
  )
}
