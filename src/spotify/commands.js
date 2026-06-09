import * as api from './api.js'
import { getDeviceId } from './player.js'

export async function handleMusicCommand(text, volume, setVolume) {
  const t = text.toLowerCase().trim()
  const deviceId = getDeviceId()

  // What's playing
  if (/what.{0,15}(playing|song|track)|now playing|currently playing/.test(t)) {
    try {
      const playback = await api.getCurrentPlayback()
      if (!playback?.item) return "Nothing is playing right now."
      const artist = playback.item.artists.map(a => a.name).join(', ')
      return `Now playing ${playback.item.name} by ${artist}.`
    } catch { return "Couldn't check playback right now." }
  }

  // Pause / stop
  if (/^(pause|pause music|stop music|stop the music)$/.test(t)) {
    if (!deviceId) return "Spotify isn't connected yet — try connecting first."
    try { await api.pause(deviceId); return "Paused." }
    catch { return "Couldn't pause." }
  }

  // Resume
  if (/^(resume|resume music|unpause)$/.test(t)) {
    if (!deviceId) return "Spotify isn't connected yet."
    try { await api.play(deviceId); return "Resuming." }
    catch { return "Couldn't resume." }
  }

  // Skip / next
  if (/^(skip|next|next song|next track|skip song|skip track)$/.test(t)) {
    if (!deviceId) return "Spotify isn't connected yet."
    try { await api.next(deviceId); return "Skipping." }
    catch { return "Couldn't skip." }
  }

  // Previous
  if (/^(previous|prev|previous song|previous track|go back|last song)$/.test(t)) {
    if (!deviceId) return "Spotify isn't connected yet."
    try { await api.previous(deviceId); return "Going back." }
    catch { return "Couldn't go back." }
  }

  // Volume up
  if (/volume up|turn it up|louder/.test(t)) {
    if (!deviceId) return "Spotify isn't connected yet."
    const newVol = Math.min(100, volume + 10)
    try { await api.setVolume(deviceId, newVol); setVolume(newVol); return `Volume at ${newVol}%.` }
    catch { return "Couldn't adjust volume." }
  }

  // Volume down
  if (/volume down|turn it down|quieter|lower the volume/.test(t)) {
    if (!deviceId) return "Spotify isn't connected yet."
    const newVol = Math.max(0, volume - 10)
    try { await api.setVolume(deviceId, newVol); setVolume(newVol); return `Volume at ${newVol}%.` }
    catch { return "Couldn't adjust volume." }
  }

  // Play my [x] playlist — check before generic "play" so it takes priority
  const playlistMatch = t.match(/play(?:\s+my)?\s+(.+?)\s+playlist/)
  if (playlistMatch) {
    const query = playlistMatch[1].trim()
    if (!deviceId) return "Spotify isn't connected yet."
    try {
      const playlists = await api.getUserPlaylists()
      const found = playlists?.items?.find(p => p.name.toLowerCase().includes(query))
      if (found) {
        await api.play(deviceId, { context_uri: found.uri })
        return `Playing your ${found.name} playlist.`
      }
      // Fallback: search Spotify
      const results = await api.search(`${query} playlist`, ['playlist'])
      const pl = results?.playlists?.items?.[0]
      if (pl) {
        await api.play(deviceId, { context_uri: pl.uri })
        return `Playing ${pl.name}.`
      }
      return `Couldn't find a playlist called "${query}".`
    } catch (err) { return `Couldn't play that playlist: ${err.message}` }
  }

  // Play [song/artist] — most general, must be last
  const playMatch = t.match(/^play\s+(.+)$/)
  if (playMatch) {
    const query = playMatch[1].trim()
    if (!deviceId) return "Spotify isn't connected yet."
    try {
      const results = await api.search(query, ['track', 'artist'])
      const track = results?.tracks?.items?.[0]
      if (track) {
        await api.play(deviceId, { uris: [track.uri] })
        const artist = track.artists[0]?.name
        return `Playing ${track.name}${artist ? ` by ${artist}` : ''}.`
      }
      return `Couldn't find "${query}" on Spotify.`
    } catch (err) { return `Couldn't play that: ${err.message}` }
  }

  return null
}
