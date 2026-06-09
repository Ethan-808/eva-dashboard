import React, { useState, useEffect } from 'react'

function getHST() {
  const now = new Date()
  const time = now.toLocaleTimeString('en-US', {
    timeZone: 'Pacific/Honolulu',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  })
  const date = now.toLocaleDateString('en-US', {
    timeZone: 'Pacific/Honolulu',
    weekday: 'long', month: 'long', day: 'numeric',
  })
  return { time, date }
}

export default function ClockWidget() {
  const [{ time, date }, setClock] = useState(getHST)

  useEffect(() => {
    const id = setInterval(() => setClock(getHST()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="glass-card clock-widget">
      <div className="widget-label">◈ LOCAL TIME — HST</div>
      <div className="clock-time">{time}</div>
      <div className="clock-date">{date}</div>
    </div>
  )
}
