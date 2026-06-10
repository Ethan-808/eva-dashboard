import React, { useMemo } from 'react'

export default function StarField() {
  const stars = useMemo(() => {
    return Array.from({ length: 120 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      opacity: 0.15 + Math.random() * 0.45,
      size: Math.random() < 0.15 ? 2 : 1,
    }))
  }, [])

  return (
    <div className="star-field" aria-hidden="true">
      {stars.map(s => (
        <span
          key={s.id}
          className="star-dot"
          style={{
            left:    `${s.x}%`,
            top:     `${s.y}%`,
            opacity: s.opacity,
            width:   s.size,
            height:  s.size,
          }}
        />
      ))}
    </div>
  )
}
