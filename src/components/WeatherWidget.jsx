import React, { useState, useEffect } from 'react'

const WEATHER_ICONS = {
  clear: '◎', sunny: '◎', cloud: '◑', overcast: '●',
  rain: '▾', drizzle: '▾', storm: '⚡', thunder: '⚡',
  fog: '≋', mist: '≋', snow: '❄',
}

function getIcon(desc = '') {
  const d = desc.toLowerCase()
  if (d.includes('thunder') || d.includes('storm')) return '⚡'
  if (d.includes('rain') || d.includes('shower') || d.includes('drizzle')) return '▾'
  if (d.includes('snow')) return '❄'
  if (d.includes('fog') || d.includes('mist') || d.includes('haze')) return '≋'
  if (d.includes('overcast')) return '●'
  if (d.includes('cloud') || d.includes('partly')) return '◑'
  return '◎'
}

async function fetchWeather() {
  const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY
  if (apiKey) {
    try {
      const res = await fetch(`/api/weather/data/2.5/weather?q=Honolulu&appid=${apiKey}&units=imperial`)
      if (res.ok) {
        const d = await res.json()
        return {
          temp: Math.round(d.main.temp),
          feels: Math.round(d.main.feels_like),
          desc: d.weather[0].description,
          humidity: d.main.humidity,
          wind: Math.round(d.wind.speed),
          icon: getIcon(d.weather[0].description),
        }
      }
    } catch {}
  }
  // wttr.in fallback
  try {
    const res = await fetch('https://wttr.in/Honolulu?format=j1')
    if (res.ok) {
      const d = await res.json()
      const c = d.current_condition[0]
      return {
        temp: parseInt(c.temp_F),
        feels: parseInt(c.FeelsLikeF),
        desc: c.weatherDesc[0].value,
        humidity: parseInt(c.humidity),
        wind: parseInt(c.windspeedMiles),
        icon: getIcon(c.weatherDesc[0].value),
      }
    }
  } catch {}
  return null
}

export default function WeatherWidget() {
  const [weather, setWeather] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchWeather().then(w => { setWeather(w); setLoading(false) })
    const id = setInterval(() => fetchWeather().then(setWeather), 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="glass-card weather-widget">
      <div className="widget-label">◈ WEATHER — HONOLULU, HI</div>
      {loading ? (
        <div className="widget-loading">FETCHING...</div>
      ) : weather ? (
        <>
          <div className="weather-main">
            <span className="weather-icon">{weather.icon}</span>
            <span className="weather-temp">{weather.temp}°F</span>
          </div>
          <div className="weather-desc">{weather.desc.toUpperCase()}</div>
          <div className="weather-meta">
            <span>FEELS {weather.feels}°</span>
            <span className="meta-sep">·</span>
            <span>HUM {weather.humidity}%</span>
            <span className="meta-sep">·</span>
            <span>WIND {weather.wind} MPH</span>
          </div>
        </>
      ) : (
        <div className="widget-loading">UNAVAILABLE</div>
      )}
    </div>
  )
}
