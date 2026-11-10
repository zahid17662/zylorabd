import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { api, tokens } from '../api'
import { btn, inp, label } from './ui'

const MIN = 8

export function ChangePassword({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    if (next.length < MIN) return setErr(`New password must be at least ${MIN} characters.`)
    if (next !== confirm) return setErr('The new passwords do not match.')
    setBusy(true)
    try {
      // Other devices are signed out by the server; this session receives fresh tokens.
      tokens.set(await api('/auth/change-password', { method: 'POST', body: { current_password: current, new_password: next } }))
      setDone(true)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Change password"
        className="w-full max-w-[420px] space-y-4 rounded-t-2xl bg-white p-5 pb-8 sm:rounded-lg sm:pb-5"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-[24px]">Change password</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full hover:bg-cream sm:size-8"><X className="size-5" /></button>
        </div>
        {done ? (
          <>
            <p role="status" className="text-[14px] text-emerald-800">Password updated. Other devices have been signed out.</p>
            <button type="button" className="w-full rounded-full bg-ink py-3 text-[14px] text-white" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <div><label className={label} htmlFor="cp-current">Current password</label><input id="cp-current" className={inp} type="password" autoComplete="current-password" autoFocus required value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
            <div><label className={label} htmlFor="cp-new">New password</label><input id="cp-new" className={inp} type="password" autoComplete="new-password" minLength={MIN} maxLength={128} required value={next} onChange={(e) => setNext(e.target.value)} /><p className="mt-1 text-[12px] text-muted">At least {MIN} characters.</p></div>
            <div><label className={label} htmlFor="cp-confirm">Confirm new password</label><input id="cp-confirm" className={inp} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
            {err && <p role="alert" className="text-[13px] text-wine">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={btn} onClick={onClose}>Cancel</button>
              <button disabled={busy || !current || !next || !confirm} className="rounded-full bg-ink px-6 py-2 text-[13px] text-white disabled:opacity-50">{busy ? 'Saving…' : 'Update password'}</button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
