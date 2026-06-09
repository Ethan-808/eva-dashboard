import React, { useEffect, useRef } from 'react'

export default function ConversationLog({ conversation }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation])

  const recent = conversation.slice(-10)

  return (
    <div className="conv-log glass-card">
      <div className="conv-log-header">
        <span className="widget-label" style={{ margin: 0 }}>◈ CONVERSATION</span>
        {conversation.length > 0 && (
          <span className="conv-count">{conversation.length} messages</span>
        )}
      </div>
      <div className="conv-messages">
        {recent.length === 0 ? (
          <div className="conv-empty">Awaiting input — press the orb or say "Hey EVA"</div>
        ) : (
          recent.map((msg, i) => (
            <div
              key={i}
              className={`conv-entry conv-entry-${msg.role} ${msg.isError ? 'conv-entry-error' : ''}`}
            >
              {msg.role === 'assistant' && (
                <div className="conv-avatar conv-avatar-eva">
                  <OrbIcon />
                </div>
              )}
              <div className="conv-bubble-wrap">
                <div className={`conv-bubble ${msg.isError ? 'conv-bubble-error' : ''}`}>
                  {msg.content}
                </div>
                <div className="conv-meta">
                  <span className="conv-time">
                    {msg.timestamp.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {msg.isIntent && <span className="conv-badge conv-badge-local">LOCAL</span>}
                  {msg.isCached && <span className="conv-badge conv-badge-cache">CACHED</span>}
                </div>
              </div>
              {msg.role === 'user' && (
                <div className="conv-avatar conv-avatar-user">
                  <UserIcon />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function OrbIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#00d4ff" strokeWidth="1" opacity="0.6" />
      <circle cx="12" cy="12" r="6"  stroke="#00d4ff" strokeWidth="1" opacity="0.8" />
      <circle cx="12" cy="12" r="2.5" fill="#00d4ff" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
      <circle cx="12" cy="8"  r="4"  stroke="#4dffa0" strokeWidth="1.5" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#4dffa0" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
