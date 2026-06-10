import React, { useEffect, useRef, useState } from 'react'

export default function NewsVisual({ articles, visible, onDismiss }) {
  const [idx, setIdx]     = useState(0)
  const timerRef  = useRef(null)
  const cycleRef  = useRef(null)

  useEffect(() => {
    if (visible) {
      setIdx(0)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onDismiss?.(), 10000)
      clearInterval(cycleRef.current)
      if (articles?.length > 1) {
        cycleRef.current = setInterval(() => setIdx(i => (i + 1) % articles.length), 3500)
      }
    } else {
      clearInterval(cycleRef.current)
    }
    return () => { clearTimeout(timerRef.current); clearInterval(cycleRef.current) }
  }, [visible, articles, onDismiss])

  const article = articles?.[idx]

  return (
    <div className={`visual-panel vp-news ${visible ? 'vp-visible' : ''}`} onClick={onDismiss}>
      <span className="vp-label">◈ TOP NEWS</span>
      {article ? (
        <>
          <div className="nv-headline">{article.title}</div>
          <div className="nv-meta">
            <span className="nv-source">{article.source}</span>
            {(articles?.length ?? 0) > 1 && (
              <div className="nv-dots">
                {articles.map((_, i) => (
                  <span key={i} className={`nv-dot${i === idx ? ' nv-dot-active' : ''}`} />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="sv-loading">FETCHING...</div>
      )}
    </div>
  )
}
