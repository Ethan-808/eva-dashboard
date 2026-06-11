const TOKEN_KEY  = 'eva_gmail_token'
const EXPIRY_KEY = 'eva_gmail_expiry'
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

export function initiateGmailAuth() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) {
    console.error('[EVA Gmail] VITE_GOOGLE_CLIENT_ID not set')
    return
  }
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  window.location.origin + '/',
    response_type: 'token',
    scope:         SCOPE,
  })
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export function handleGmailCallback() {
  if (!window.location.hash) return false
  const params = new URLSearchParams(window.location.hash.slice(1))
  const accessToken = params.get('access_token')
  const expiresIn   = params.get('expires_in')
  const scope       = params.get('scope') || ''
  if (!accessToken || !scope.includes('gmail')) return false
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + (parseInt(expiresIn) || 3600) * 1000))
  window.history.replaceState({}, '', window.location.pathname)
  return true
}

export function getGmailToken() {
  const token  = localStorage.getItem(TOKEN_KEY)
  const expiry = parseInt(localStorage.getItem(EXPIRY_KEY) || '0')
  if (!token || Date.now() > expiry) return null
  return token
}

export function isGmailConnected() {
  return !!getGmailToken()
}

export function disconnectGmail() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EXPIRY_KEY)
}
