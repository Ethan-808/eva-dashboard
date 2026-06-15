import React, { useMemo } from 'react'

export default function StarField() {
  const { stars, nebulae } = useMemo(() => {
    const s = Array.from({ length: 160 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      opacity: 0.1 + Math.random() * 0.5,
      size: Math.random() < 0.06 ? 3 : Math.random() < 0.2 ? 2 : 1,
      twinkle: Math.random() < 0.4,
      twinkleDur: 2 + Math.random() * 5,
      twinkleDelay: Math.random() * 6,
      glow: Math.random() < 0.08,
    }))
    const n = Array.from({ length: 4 }, (_, i) => ({
      id: i,
      x: [18, 72, 38, 85][i],
      y: [22, 15, 75, 68][i],
      size: 180 + i * 60,
      color: [
        'rgba(0,212,255,0.028)',
        'rgba(120,80,255,0.022)',
        'rgba(0,212,255,0.018)',
        'rgba(77,255,160,0.015)',
      ][i],
    }))
    return { stars: s, nebulae: n }
  }, [])

  return (
    <div className="star-field" aria-hidden="true">
      {nebulae.map(n => (
        <div
          key={`neb-${n.id}`}
          className="star-nebula"
          style={{
            left: `${n.x}%`,
            top: `${n.y}%`,
            width: n.size,
            height: n.size,
            background: `radial-gradient(circle, ${n.color} 0%, transparent 70%)`,
          }}
        />
      ))}
      {stars.map(s => (
        <span
          key={s.id}
          className={`star-dot ${s.twinkle ? 'star-twinkle' : ''} ${s.glow ? 'star-glow' : ''}`}
          style={{
            left:    `${s.x}%`,
            top:     `${s.y}%`,
            opacity: s.opacity,
            width:   s.size,
            height:  s.size,
            animationDuration: s.twinkle ? `${s.twinkleDur}s` : undefined,
            animationDelay:    s.twinkle ? `${s.twinkleDelay}s` : undefined,
          }}
        />
      ))}
    </div>
  )
}
