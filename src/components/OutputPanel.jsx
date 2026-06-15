import React, { useState, useRef, useEffect } from 'react'

function inlineFormat(text) {
  const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/
  return text.split(re).map((token, i) => {
    if (token.startsWith('**') && token.endsWith('**'))
      return <strong key={i} className="op-bold">{token.slice(2, -2)}</strong>
    if (token.startsWith('*') && token.endsWith('*'))
      return <em key={i} className="op-em">{token.slice(1, -1)}</em>
    if (token.startsWith('`') && token.endsWith('`'))
      return <code key={i} className="op-inline-code">{token.slice(1, -1)}</code>
    return token
  })
}

function renderMarkdown(md) {
  if (!md) return null
  const lines = md.split('\n')
  const elements = []
  let inCode = false
  let codeLines = []
  let codeLang = ''
  let listItems = []
  let k = 0

  const flushList = () => {
    if (!listItems.length) return
    elements.push(
      <ul key={k++} className="op-ul">
        {listItems.map((item, i) => <li key={i} className="op-li">{inlineFormat(item)}</li>)}
      </ul>
    )
    listItems = []
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCode) {
        flushList()
        inCode = true
        codeLang = line.slice(3).trim()
        codeLines = []
      } else {
        inCode = false
        elements.push(
          <pre key={k++} className="op-pre">
            {codeLang && <span className="op-code-lang">{codeLang}</span>}
            <code>{codeLines.join('\n')}</code>
          </pre>
        )
      }
      continue
    }

    if (inCode) { codeLines.push(line); continue }

    if (line.startsWith('# ')) {
      flushList()
      elements.push(<h1 key={k++} className="op-h1">{inlineFormat(line.slice(2))}</h1>)
      continue
    }
    if (line.startsWith('## ')) {
      flushList()
      elements.push(<h2 key={k++} className="op-h2">{inlineFormat(line.slice(3))}</h2>)
      continue
    }
    if (line.startsWith('### ')) {
      flushList()
      elements.push(<h3 key={k++} className="op-h3">{inlineFormat(line.slice(4))}</h3>)
      continue
    }

    const listMatch = line.match(/^[-*]\s+(.+)/) || line.match(/^\d+\.\s+(.+)/)
    if (listMatch) { listItems.push(listMatch[1]); continue }

    flushList()
    if (line.trim() === '') { elements.push(<div key={k++} className="op-gap" />); continue }
    elements.push(<p key={k++} className="op-p">{inlineFormat(line)}</p>)
  }
  flushList()
  return elements
}

export default function OutputPanel({ content, visible, onDismiss }) {
  const scrollRef = useRef(null)
  const htmlMatch = content?.match(/```html\n([\s\S]*?)```/)
  const [showHtml, setShowHtml] = useState(false)

  useEffect(() => {
    if (visible && scrollRef.current) scrollRef.current.scrollTop = 0
    setShowHtml(false)
  }, [visible, content])

  return (
    <div className={`panel panel-output ${visible ? 'panel-visible' : ''}`}>
      <div className="op-header">
        <span className="widget-label" style={{ margin: 0 }}>◈ OUTPUT</span>
        <div className="op-header-right">
          {htmlMatch && (
            <button className="op-toggle-btn" onClick={() => setShowHtml(s => !s)}>
              {showHtml ? 'MARKDOWN' : 'PREVIEW'}
            </button>
          )}
          <button className="panel-close" style={{ position: 'static' }} onClick={onDismiss}>
            ✕ CLOSE
          </button>
        </div>
      </div>
      <div className="op-scroll" ref={scrollRef}>
        {showHtml && htmlMatch ? (
          <iframe
            className="op-iframe"
            srcDoc={htmlMatch[1]}
            sandbox="allow-scripts"
            title="Preview"
          />
        ) : (
          <div className="op-markdown">
            {renderMarkdown(content || '')}
          </div>
        )}
      </div>
    </div>
  )
}
