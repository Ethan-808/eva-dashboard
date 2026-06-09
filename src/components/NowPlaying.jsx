import React, { useState, useEffect, useRef } from 'react'

export default function NowPlaying({ playerState, onControl }) {
  const [progress, setProgress] = useState(0)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!playerState) return
    const startPos = playerState.position
    const startTime = Date.now()

    clearInterval(intervalRef.current)
    if (!playerState.paused) {
      intervalRef.current = setInterval(() => {
        setProgress(Math.min(startPos + (Date.now() - startTime), playerState.duration))
      }, 500)
    } else {
      setProgress(startPos)
    }
    return () => clearInterval(intervalRef.current)
  }, [playerState])

  const fmt = ms => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  const track = playerState?.track_window?.current_track
  const isPlaying = playerState && !playerState.paused
  const pct = playerState?.duration > 0 ? Math.min(100, (progress / playerState.duration) * 100) : 0

  return (
    <div className="glass-card now-playing-card">
      <div className="widget-label">◈ NOW PLAYING</div>
      {track ? (
        <div className="np-content">
          {track.album?.images?.[0]?.url && (
            <img className="np-art" src={track.album.images[0].url} alt="" />
          )}
          <div className="np-info">
            <div className="np-track">{track.name}</div>
            <div className="np-artist">{track.artists?.map(a => a.name).join(', ')}</div>
            <div className="np-progress-row">
              <span className="np-time">{fmt(progress)}</span>
              <div className="np-bar"><div className="np-bar-fill" style={{ width: `${pct}%` }} /></div>
              <span className="np-time">{fmt(playerState.duration)}</span>
            </div>
            <div className="np-controls">
              <button className="np-btn" onClick={() => onControl('previous')}><PrevIcon /></button>
              <button className="np-btn np-btn-play" onClick={() => onControl('toggle')}>
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button className="np-btn" onClick={() => onControl('next')}><NextIcon /></button>
            </div>
          </div>
        </div>
      ) : (
        <div className="np-empty">
          <MusicIcon />
          <span>No music playing</span>
          <span className="np-hint">say "play [artist or song]"</span>
        </div>
      )}
    </div>
  )
}

function PrevIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg> }
function PlayIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M8 5v14l11-7z"/></svg> }
function PauseIcon() { return <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M6 19h4V5H6zm8-14v14h4V5h-4z"/></svg> }
function NextIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg> }
function MusicIcon() { return <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" opacity="0.25"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg> }
