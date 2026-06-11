import React, { useEffect, useState } from 'react'

function LiveClock() {
  const fmt = () =>
    new Date().toLocaleTimeString('en-US', {
      timeZone: 'Pacific/Honolulu', hour: 'numeric', minute: '2-digit', hour12: true,
    })
  const [t, setT] = useState(fmt)
  useEffect(() => {
    const id = setInterval(() => setT(fmt()), 10000)
    return () => clearInterval(id)
  }, [])
  return <>{t}</>
}

export default function MorningBriefingVisual({ visible, phase, data, onDismiss }) {
  const dateStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'Pacific/Honolulu', weekday: 'long', month: 'long', day: 'numeric',
  }).toUpperCase()

  return (
    <div className={`mb-overlay ${visible ? 'mb-visible' : ''}`} onClick={onDismiss}>
      <div className="mb-grid">

        <div className={`mb-quadrant${phase >= 1 ? ' mb-q-active' : ''}`}>
          <div className="mb-q-label">◈ WEATHER</div>
          {data?.weather ? (
            <>
              <div className="mb-weather-temp">{data.weather.temp}°F</div>
              <div className="mb-weather-desc">{(data.weather.desc || '').toUpperCase()}</div>
            </>
          ) : (
            <div className="mb-q-loading">···</div>
          )}
        </div>

        <div className={`mb-quadrant${phase >= 2 ? ' mb-q-active' : ''}`}>
          <div className="mb-q-label">◈ MARKETS</div>
          {data?.markets ? (
            <div className="mb-q-text">{data.markets}</div>
          ) : (
            <div className="mb-q-loading">···</div>
          )}
        </div>

        <div className={`mb-quadrant${phase >= 3 ? ' mb-q-active' : ''}`}>
          <div className="mb-q-label">◈ TOP STORY</div>
          {data?.headline ? (
            <div className="mb-q-headline">{data.headline}</div>
          ) : (
            <div className="mb-q-loading">···</div>
          )}
        </div>

        <div className={`mb-quadrant${phase >= 4 ? ' mb-q-active' : ''}`}>
          {data?.nextEvent ? (
            <>
              <div className="mb-q-label">◈ AGENDA</div>
              <div className="mb-agenda-title">{data.nextEvent.title}</div>
              {data.nextEvent.time && (
                <div className="mb-agenda-time">{data.nextEvent.time}</div>
              )}
            </>
          ) : (
            <>
              <div className="mb-q-label">◈ NOW</div>
              <div className="mb-clock"><LiveClock /></div>
              <div className="mb-date">{dateStr}</div>
            </>
          )}
        </div>

      </div>

      {phase >= 4 && data?.motiv && (
        <div className="mb-motiv">{data.motiv}</div>
      )}
    </div>
  )
}
