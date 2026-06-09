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

export async function play(deviceId, options = {}) {
  return spotifyFetch(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify(options),
  })
}

export async function pause(deviceId) {
  return spotifyFetch(`/me/player/pause?device_id=${deviceId}`, { method: 'PUT' })
}

export async function next(deviceId) {
  return spotifyFetch(`/me/player/next?device_id=${deviceId}`, { method: 'POST' })
}

export async function previous(deviceId) {
  return spotifyFetch(`/me/player/previous?device_id=${deviceId}`, { method: 'POST' })
}

export async function setVolume(deviceId, percent) {
  return spotifyFetch(
    `/me/player/volume?volume_percent=${Math.round(percent)}&device_id=${deviceId}`,
    { method: 'PUT' }
  )
}

export async function getCurrentPlayback() {
  return spotifyFetch('/me/player?additional_types=track')
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
