import { getToken } from './auth.js'

async function spotifyFetch(path, options = {}) {
  const token = await getToken()
  if (!token) throw new Error('Not authenticated with Spotify')

  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  if (res.status === 204) return null
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Spotify ${res.status}`)
  }
  return res.json()
}

export async function search(query, types = ['track']) {
  return spotifyFetch(`/search?q=${encodeURIComponent(query)}&type=${types.join(',')}&limit=5`)
}

export async function getDevices() {
  return spotifyFetch('/me/player/devices')
}

export async function play(deviceId, options = {}) {
  const q = deviceId ? `?device_id=${deviceId}` : ''
  return spotifyFetch(`/me/player/play${q}`, {
    method: 'PUT',
    body: JSON.stringify(options),
  })
}

export async function pause(deviceId) {
  const q = deviceId ? `?device_id=${deviceId}` : ''
  return spotifyFetch(`/me/player/pause${q}`, { method: 'PUT' })
}

export async function next(deviceId) {
  const q = deviceId ? `?device_id=${deviceId}` : ''
  return spotifyFetch(`/me/player/next${q}`, { method: 'POST' })
}

export async function previous(deviceId) {
  const q = deviceId ? `?device_id=${deviceId}` : ''
  return spotifyFetch(`/me/player/previous${q}`, { method: 'POST' })
}

export async function setVolume(deviceId, percent) {
  const q = deviceId ? `&device_id=${deviceId}` : ''
  return spotifyFetch(
    `/me/player/volume?volume_percent=${Math.round(percent)}${q}`,
    { method: 'PUT' }
  )
}

export async function getCurrentPlayback() {
  return spotifyFetch('/me/player?additional_types=track')
}

export async function getCurrentlyPlaying() {
  return spotifyFetch('/me/player/currently-playing?additional_types=track')
}

export async function addToQueue(trackUri, deviceId) {
  const q = `uri=${encodeURIComponent(trackUri)}${deviceId ? `&device_id=${deviceId}` : ''}`
  return spotifyFetch(`/me/player/queue?${q}`, { method: 'POST' })
}

export async function getUserPlaylists() {
  return spotifyFetch('/me/playlists?limit=50')
}

export async function transferPlayback(deviceId) {
  return spotifyFetch('/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  })
}
