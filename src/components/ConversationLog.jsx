import React, { useEffect, useRef } from 'react'

export default function ConversationLog({ conversation }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation])

  if (conversation.length === 0) {
    return (
      <div className="conversation-log conversation-log-empty">
        <div className="log-header">
          <span className="log-header-accent">▸</span> CONVERSATION LOG
        </div>
        <div className="log-empty-state">
          <span>Awaiting input...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="conversation-log">
      <div className="log-header">
        <span className="log-header-accent">▸</span> CONVERSATION LOG
        <span className="log-count">{conversation.length} entries</span>
      </div>
      <div className="log-messages">
        {conversation.map((msg, i) => (
          <div
            key={i}
            className={`log-entry log-entry-${msg.role}${msg.isError ? ' log-entry-error' : ''}`}
          >
            <span className="log-timestamp">
              [{msg.timestamp.toLocaleTimeString('en-US', { hour12: false })}]
            </span>
            <span className="log-role">
              {msg.role === 'user' ? 'YOU' : 'EVA'}:
            </span>
            <span className="log-content">{msg.content}</span>
            {msg.isIntent && <span className="log-badge log-badge-intent">LOCAL</span>}
            {msg.isCached && <span className="log-badge log-badge-cache">CACHED</span>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
