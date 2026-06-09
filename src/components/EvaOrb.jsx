import React from 'react'

export default function EvaOrb({ status, wakeMode, onClick }) {
  const label =
    status === 'listening' ? 'LISTENING' :
    status === 'speaking'  ? 'SPEAKING'  :
    status === 'loading'   ? 'THINKING'  : ''

  return (
    <div className={`orb-wrap orb-${status}`} onClick={onClick} role="button" aria-label="Speak to EVA">
      <div className="orb-ring orb-ring-outer" />
      <div className="orb-ring orb-ring-middle" />
      <div className="orb-ring orb-ring-inner" />
      <div className="orb-core">
        <span className="orb-text">EVA</span>
        {label && <span className="orb-subtext">{label}</span>}
      </div>
    </div>
  )
}
