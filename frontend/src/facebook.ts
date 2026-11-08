/** Facebook Login via the official JS SDK. Enabled only when VITE_FACEBOOK_APP_ID is set. */
const APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID as string | undefined

interface FbLoginResponse {
  authResponse?: { accessToken: string }
}
interface FbSdk {
  init: (opts: { appId: string; version: string; cookie?: boolean; xfbml?: boolean }) => void
  login: (cb: (r: FbLoginResponse) => void, opts: { scope: string }) => void
}
declare global {
  interface Window {
    FB?: FbSdk
    fbAsyncInit?: () => void
  }
}

export const facebookEnabled = Boolean(APP_ID)

let loading: Promise<void> | null = null

/** Load the SDK ahead of time: FB.login must run inside the click handler or popup blockers stop it. */
export function preloadFacebook(): Promise<void> {
  if (!APP_ID) return Promise.reject(new Error('Facebook login is not configured'))
  if (window.FB) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: APP_ID, version: 'v21.0', cookie: false, xfbml: false })
      resolve()
    }
    const s = document.createElement('script')
    s.src = 'https://connect.facebook.net/en_US/sdk.js'
    s.async = true
    s.onerror = () => {
      loading = null
      reject(new Error('Could not load Facebook. Check your connection or ad-blocker.'))
    }
    document.head.appendChild(s)
  })
  return loading
}

/** Opens the Facebook popup and resolves with an access token the backend then verifies. */
export function facebookAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.FB) return reject(new Error('Facebook is still loading. Please try again in a moment.'))
    window.FB.login(
      (r) => (r.authResponse ? resolve(r.authResponse.accessToken) : reject(new Error('Facebook sign-in was cancelled.'))),
      { scope: 'public_profile,email' },
    )
  })
}
