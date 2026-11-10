/** Sign in with Google (Google Identity Services). Enabled only when VITE_GOOGLE_CLIENT_ID is set. */
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

interface GsiButtonOptions {
  type?: 'standard'
  theme?: 'outline' | 'filled_black'
  size?: 'large' | 'medium'
  text?: 'continue_with' | 'signin_with'
  shape?: 'pill' | 'rectangular'
  width?: number
  logo_alignment?: 'left' | 'center'
}
interface GsiId {
  initialize: (opts: { client_id: string; callback: (r: { credential?: string }) => void; use_fedcm_for_prompt?: boolean }) => void
  renderButton: (el: HTMLElement, opts: GsiButtonOptions) => void
}
declare global {
  interface Window {
    google?: { accounts: { id: GsiId } }
  }
}

export const googleEnabled = Boolean(CLIENT_ID)

let loading: Promise<void> | null = null

function loadGoogle(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      reject(new Error('Could not load Google sign-in. Check your connection or ad-blocker.'))
    }
    document.head.appendChild(s)
  })
  return loading
}

/** Draws Google's official button into `el`; `onCredential` receives an ID token the backend verifies. */
export async function renderGoogleButton(el: HTMLElement, onCredential: (idToken: string) => void): Promise<void> {
  if (!CLIENT_ID) throw new Error('Google sign-in is not configured')
  await loadGoogle()
  const gsi = window.google!.accounts.id
  gsi.initialize({ client_id: CLIENT_ID, callback: (r) => r.credential && onCredential(r.credential) })
  el.replaceChildren()
  gsi.renderButton(el, {
    type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'center',
    width: Math.min(400, Math.max(200, Math.floor(el.clientWidth || 320))),
  })
}
