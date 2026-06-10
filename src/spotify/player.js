import { getToken } from './auth.js'

let player = null
let _deviceId = null
let _onStateChange = null
let _reconnectTimer = null
let _reconnectAttempts = 0

// Check for Player constructor specifically — the SDK script may define window.Spotify
// before calling onSpotifyWebPlaybackSDKReady, so window.Spotify alone isn't a safe guard.
const sdkReady = window.Spotify?.Player
  ? Promise.resolve()
  : new Promise(resolve => {
      const prev = window.onSpotifyWebPlaybackSDKReady
      window.onSpotifyWebPlaybackSDKReady = () => { prev?.(); resolve() }
    })

function scheduleReconnect() {
  if (_reconnectTimer) return
  const delay = Math.min(1000 * 2 ** _reconnectAttempts, 30000)
  _reconnectAttempts++
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null
    if (player && !_deviceId) player.connect()
  }, delay)
}

// Re-connect when the tab comes back into focus (browser may have killed the WS)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && player && !_deviceId) {
    scheduleReconnect()
  }
})

export async function initPlayer(onStateChange) {
  _onStateChange = onStateChange

  // Skip only if player is alive AND we have a device ID
  if (player && _deviceId) return _deviceId

  await sdkReady

  // Disconnect a stale player (e.g. device went offline)
  if (player) {
    player.disconnect()
    player = null
    _deviceId = null
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Spotify SDK timed out'))
    }, 10000)

    player = new window.Spotify.Player({
      name: 'EVA Dashboard',
      getOAuthToken: async cb => {
        const token = await getToken()
        if (token) {
          cb(token)
        } else {
          // Auth gone — destroy so caller can re-initiate login
          destroyPlayer()
        }
      },
      volume: 0.5,
    })

    player.addListener('ready', ({ device_id }) => {
      clearTimeout(timeout)
      _reconnectAttempts = 0
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }
      _deviceId = device_id
      resolve(device_id)
    })

    player.addListener('not_ready', ({ device_id }) => {
      console.warn('[EVA Spotify] Device offline:', device_id)
      if (_deviceId === device_id) {
        _deviceId = null
        scheduleReconnect()
      }
    })

    player.addListener('player_state_changed', state => {
      _onStateChange?.(state)
    })

    player.addListener('initialization_error', ({ message }) => {
      clearTimeout(timeout)
      reject(new Error(message))
    })
    player.addListener('authentication_error', ({ message }) => {
      clearTimeout(timeout)
      reject(new Error(message))
    })
    player.addListener('account_error', ({ message }) => {
      clearTimeout(timeout)
      reject(new Error(message))
    })

    player.connect()
  })
}

export function getDeviceId() { return _deviceId }

export async function togglePlay() { return player?.togglePlay() }
export async function nextTrack() { return player?.nextTrack() }
export async function previousTrack() { return player?.previousTrack() }

export function destroyPlayer() {
  player?.disconnect()
  player = null
  _deviceId = null
}
