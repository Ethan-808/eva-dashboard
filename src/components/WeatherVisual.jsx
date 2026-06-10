import React, { useEffect, useRef } from 'react'

function sceneType(desc = '') {
  const d = desc.toLowerCase()
  if (d.includes('thunder') || d.includes('storm')) return 'storm'
  if (d.includes('rain') || d.includes('shower') || d.includes('drizzle')) return 'rain'
  if (d.includes('cloud') || d.includes('overcast') || d.includes('partly')) return 'cloudy'
  return 'clear'
}

function SunScene() {
  return (
    <div className="wv-scene">
      <div className="wv-sun">
        <div className="wv-sun-rays">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="wv-sun-ray" style={{ transform: `rotate(${i * 45}deg) translateY(-22px)` }} />
          ))}
        </div>
        <div className="wv-sun-core" />
      </div>
    </div>
  )
}

function CloudShape({ cls }) {
  return (
    <div className={`wv-cloud ${cls}`}>
      <div className="wv-cb wv-cb-l" />
      <div className="wv-cb wv-cb-r" />
    </div>
  )
}

function CloudScene() {
  return (
    <div className="wv-scene">
      <div className="wv-cloud-scene">
        <CloudShape cls="wv-cloud-1" />
        <CloudShape cls="wv-cloud-2" />
        <CloudShape cls="wv-cloud-3" />
      </div>
    </div>
  )
}

function RainScene({ storm }) {
  return (
    <div className="wv-scene">
      {storm && <div className="wv-lightning" />}
      <div className="wv-cloud-scene wv-cloud-scene-rain">
        <CloudShape cls="wv-cloud-1" />
        <CloudShape cls="wv-cloud-2" />
      </div>
      <div className="wv-rain-drops">
        {Array.from({ length: 18 }, (_, i) => (
          <div
            key={i}
            className="wv-rain-drop"
            style={{
              left: `${(i * 5.8) % 100}%`,
              animationDelay: `${(i * 0.07) % 0.9}s`,
              animationDuration: `${0.55 + (i % 5) * 0.08}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

export default function WeatherVisual({ condition, temp, city, visible, onDismiss }) {
  const timerRef = useRef(null)
  const type = sceneType(condition)

  useEffect(() => {
    if (visible) {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onDismiss?.(), 8000)
    }
    return () => clearTimeout(timerRef.current)
  }, [visible, onDismiss])

  return (
    <div className={`visual-panel vp-weather ${visible ? 'vp-visible' : ''}`} onClick={onDismiss}>
      <span className="vp-label">◈ WEATHER</span>
      {type === 'clear'  && <SunScene />}
      {type === 'cloudy' && <CloudScene />}
      {type === 'rain'   && <RainScene />}
      {type === 'storm'  && <RainScene storm />}
      {temp != null && <div className="vp-weather-temp">{temp}°</div>}
      {condition && <div className="vp-weather-desc">{condition.toUpperCase()}</div>}
      {city && <div className="vp-weather-city">{city.toUpperCase()}</div>}
    </div>
  )
}
