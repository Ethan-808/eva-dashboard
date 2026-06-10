import * as api from './api.js'

let _deviceId = null
let _pollInterval = null
let _onStateChange = null

function adaptState(s) {
  if (!s?.item) return null
  return {
    paused: !s.is_playing,
    position: s.progress_ms ?? 0,
    duration: s.item.duration_ms ?? 0,
    track_window: {
      current_track: {
        name: s.item.name,
        artists: s.item.artists,
        album: s.item.album,
        uri: s.item.uri,
      },
    },
  }
}

async function poll() {
  try {
    const s = await api.getCurrentPlayback()
    _deviceId = s?.device?.id ?? null
    _onStateChange?.(adaptState(s))
  } catch {}
}

export async function initPlayer(onStateChange) {
  _onStateChange = onStateChange
  await poll()
  if (!_pollInterval) {
    _pollInterval = setInterval(poll, 5000)
  }
  return _deviceId
}

export function getDeviceId() { return _deviceId }

export async function togglePlay() {
  try {
    const s = await api.getCurrentPlayback()
    const id = s?.device?.id ?? _deviceId
    if (s?.is_playing) {
      await api.pause(id)
    } else {
      await api.play(id)
    }
    setTimeout(poll, 500)
  } catch {}
}

export async function nextTrack() {
  try { await api.next(_deviceId); setTimeout(poll, 1000) } catch {}
}

export async function previousTrack() {
  try { await api.previous(_deviceId); setTimeout(poll, 1000) } catch {}
}

export function destroyPlayer() {
  clearInterval(_pollInterval)
  _pollInterval = null
  _deviceId = null
}
