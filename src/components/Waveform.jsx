import React from 'react'

const BAR_COUNT = 48

export default function Waveform({ active, type }) {
  return (
    <div className={`waveform${active ? ` waveform-active waveform-${type}` : ''}`}>
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const center = BAR_COUNT / 2
        const distFromCenter = Math.abs(i - center) / center
        const maxH = Math.max(10, 64 * (1 - distFromCenter * 0.4))
        const dur = 380 + ((i * 53 + i * i * 7) % 480)
        const delay = (i * 41 + i * 13) % 700

        return (
          <div
            key={i}
            className="waveform-bar"
            style={{
              '--bar-max': `${maxH}px`,
              '--bar-dur': `${dur}ms`,
              animationDelay: `${delay}ms`,
            }}
          />
        )
      })}
    </div>
  )
}
