import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'
import { isBdPhone } from '../data'
import { facebookAccessToken, facebookEnabled, preloadFacebook } from '../facebook'

type Tab = 'email' | 'phone' | 'register'
const field = 'w-full border border-line bg-white px-4 py-3 text-[14px] outline-none focus:border-ink'

export function AuthModal() {
  const { modal, closeLogin, login, register } = useAuth()
  const [tab, setTab] = useState<Tab>('email')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [f, setF] = useState({ name: '', email: '', password: '', phone: '', otp: '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  // Load the Facebook SDK before the click: FB.login must run inside the click handler.
  useEffect(() => {
    if (modal && facebookEnabled) preloadFacebook().catch(() => undefined)
  }, [modal])

  if (!modal) return null

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(() => {
      if (tab === 'register') return register(f.name, f.email, f.password)
      if (tab === 'email') return login({ method: 'email', email: f.email, password: f.password })
      if (!isBdPhone(f.phone)) throw new Error('Enter a valid mobile number, e.g. 01712345678')
      if (!/^\d{6}$/.test(f.otp)) throw new Error('Enter the 6-digit code from the SMS')
      return login({ method: 'phone', phone: f.phone, otp: f.otp, name: f.name || undefined })
    })
  }

  const sendOtp = () =>
    run(async () => {
      if (!isBdPhone(f.phone)) throw new Error('Enter a valid mobile number, e.g. 01712345678')
      await api('/auth/otp/request', { body: { phone: f.phone } })
      setInfo('Code sent by SMS. It is valid for 5 minutes.')
    })

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4" onClick={closeLogin}>
      <div role="dialog" aria-label="Sign in" className="relative w-full max-w-[420px] bg-white p-8" onClick={(e) => e.stopPropagation()}>
        <button onClick={closeLogin} aria-label="Close" className="absolute top-4 right-4">
          <X className="size-5" strokeWidth={1.25} />
        </button>
        <h2 className="font-serif text-[28px]">{tab === 'register' ? 'Create account' : 'Sign in'}</h2>

        <div className="mt-5 flex gap-5 border-b border-line text-[13px]">
          {([['email', 'Email'], ['phone', 'Phone OTP'], ['register', 'New here?']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setTab(k)
                setErr('')
                setInfo('')
              }}
              className={`-mb-px border-b pb-2 ${tab === k ? 'border-ink' : 'border-transparent text-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-3">
          {tab === 'register' && <input className={field} placeholder="Full name" required value={f.name} onChange={set('name')} />}
          {tab !== 'phone' && (
            <>
              <input className={field} type="email" placeholder="Email" required value={f.email} onChange={set('email')} />
              <input className={field} type="password" placeholder="Password (min 8 characters)" required minLength={8} value={f.password} onChange={set('password')} />
            </>
          )}
          {tab === 'phone' && (
            <>
              <div className="flex gap-2">
                <input className={field} type="tel" placeholder="01XXXXXXXXX" required value={f.phone} onChange={set('phone')} />
                <button type="button" onClick={sendOtp} disabled={busy || !f.phone} className="shrink-0 border border-ink px-4 text-[13px] disabled:opacity-40">
                  Send code
                </button>
              </div>
              <input className={field} inputMode="numeric" maxLength={6} placeholder="6-digit code" required value={f.otp} onChange={set('otp')} />
            </>
          )}
          {info && <p className="text-[13px] text-muted">{info}</p>}
          {err && <p role="alert" className="text-[13px] text-wine">{err}</p>}
          <button disabled={busy} className="w-full rounded-full bg-ink py-3.5 text-[14px] text-white hover:bg-black disabled:opacity-50">
            {busy ? 'Please wait…' : tab === 'register' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {facebookEnabled && (
          <>
            <div className="my-5 flex items-center gap-3 text-[12px] text-muted">
              <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(async () => login({ method: 'facebook', facebook_access_token: await facebookAccessToken() }))}
              className="w-full rounded-full border border-ink py-3.5 text-[14px] hover:bg-ink hover:text-white disabled:opacity-50"
            >
              Continue with Facebook
            </button>
          </>
        )}
      </div>
    </div>
  )
}
