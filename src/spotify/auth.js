const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:5173/callback'
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
].join(' ')

const TOKEN_KEY = 'eva_spotify_auth'
const VERIFIER_KEY = 'eva_spotify_verifier'

function generateVerifier(length = 128) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => chars[b % chars.length]).join('')
}

async function generateChallenge(verifier) {
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export async function initiateLogin() {
  const verifier = generateVerifier()
  const challenge = await generateChallenge(verifier)
  const state = generateVerifier(16)

  localStorage.setItem(VERIFIER_KEY, JSON.stringify({ verifier, state }))

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })

  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

export async function handleCallback(code, returnedState) {
  const stored = JSON.parse(localStorage.getItem(VERIFIER_KEY) || 'null')
  if (!stored || stored.state !== returnedState) return false

  localStorage.removeItem(VERIFIER_KEY)

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: stored.verifier,
    }),
  })

  if (!res.ok) return false

  const data = await res.json()
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }))

  return true
}

async function doRefresh(refresh_token) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
      client_id: CLIENT_ID,
    }),
  })

  if (!res.ok) { localStorage.removeItem(TOKEN_KEY); return null }

  const data = await res.json()
  const updated = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }
  localStorage.setItem(TOKEN_KEY, JSON.stringify(updated))
  return updated.access_token
}

// Deduplicate concurrent refreshes — PKCE uses rotating tokens so two
// simultaneous calls would burn the token on the second attempt.
let _pendingRefresh = null

export async function getToken() {
  const stored = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')
  if (!stored) return null
  // Refresh 5 minutes before expiry
  if (Date.now() > stored.expires_at - 5 * 60 * 1000) {
    if (!_pendingRefresh) {
      _pendingRefresh = doRefresh(stored.refresh_token).finally(() => { _pendingRefresh = null })
    }
    return _pendingRefresh
  }
  return stored.access_token
}

export function isAuthenticated() {
  return !!localStorage.getItem(TOKEN_KEY)
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(VERIFIER_KEY)
}
