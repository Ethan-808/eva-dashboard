import React, { useState, useEffect } from 'react'
import { isAuthenticated } from '../spotify/auth.js'

const COST_PER_1K = 0.003
const TOKENS_PER_CALL = 500

function getHSTShort() {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'Pacific/Honolulu',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

export default function StatusBar({ apiCallCount, cacheHits }) {
  const [clock, setClock] = useState(getHSTShort)

  useEffect(() => {
    const id = setInterval(() => setClock(getHSTShort()), 30000)
    return () => clearInterval(id)
  }, [])

  const services = [
    { id: 'claude',   label: 'CLAUDE',   on: !!import.meta.env.VITE_CLAUDE_API_KEY },
    { id: 'tts',      label: 'TTS',      on: !!import.meta.env.VITE_ELEVENLABS_API_KEY },
    { id: 'spotify',  label: 'SPOTIFY',  on: isAuthenticated() },
    { id: 'weather',  label: 'WEATHER',  on: !!import.meta.env.VITE_OPENWEATHER_API_KEY },
    { id: 'news',     label: 'NEWS',     on: !!import.meta.env.VITE_NEWS_API_KEY },
    { id: 'stocks',   label: 'STOCKS',   on: !!import.meta.env.VITE_FINNHUB_API_KEY },
  ]

  const tokens = apiCallCount * TOKENS_PER_CALL
  const cost = (tokens / 1000) * COST_PER_1K
  const costStr = cost < 0.01 ? '<$0.01' : `$${cost.toFixed(3)}`

  return (
    <div className="status-bar">
      <div className="status-services">
        {services.map(s => (
          <div key={s.id} className="status-service" title={s.label}>
            <span className={`status-dot-sm ${s.on ? 'status-on' : 'status-off'}`} />
            <span className="status-service-label">{s.label}</span>
          </div>
        ))}
      </div>
      <div className="status-center">
        <span className="status-mode">◈ PERSONAL MODE</span>
      </div>
      <div className="status-right">
        {cacheHits > 0 && <span className="status-cache">↺{cacheHits} cached</span>}
        <span className="status-tokens">
          SESSION: {apiCallCount} API · {tokens >= 1000 ? `~${(tokens/1000).toFixed(1)}k` : tokens} tok · {costStr}
        </span>
        <span className="status-clock">{clock} HST</span>
      </div>
    </div>
  )
}
