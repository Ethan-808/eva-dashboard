import { getToken } from './auth.js'

let player = null
let _deviceId = null

// Handles both: SDK already loaded OR fires later via callback
const sdkReady = window.Spotify
  ? Promise.resolve()
  : new Promise(resolve => {
      const prev = window.onSpotifyWebPlaybackSDKReady
      window.onSpotifyWebPlaybackSDKReady = () => { prev?.(); resolve() }
    })

export async function initPlayer(onStateChange) {
  if (player) return _deviceId

  await sdkReady

  return new Promise((resolve, reject) => {
    player = new window.Spotify.Player({
      name: 'EVA Dashboard',
      getOAuthToken: async cb => {
        const token = await getToken()
        if (token) cb(token)
      },
      volume: 0.5,
    })

    player.addListener('ready', ({ device_id }) => {
      _deviceId = device_id
      resolve(device_id)
    })

    player.addListener('not_ready', ({ device_id }) => {
      console.warn('[EVA Spotify] Device offline:', device_id)
    })

    player.addListener('player_state_changed', state => {
      onStateChange?.(state)
    })

    player.addListener('initialization_error', ({ message }) => reject(new Error(message)))
    player.addListener('authentication_error', ({ message }) => reject(new Error(message)))
    player.addListener('account_error', ({ message }) => reject(new Error(message)))

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
