import React, { useState, useEffect } from 'react'

const TICKERS = [
  { symbol: 'SPY',               label: 'S&P 500',  short: 'SPY' },
  { symbol: 'QQQ',               label: 'NASDAQ',   short: 'QQQ' },
  { symbol: 'BINANCE:BTCUSDT',   label: 'BITCOIN',  short: 'BTC' },
]

async function fetchTickers() {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY
  if (!apiKey) return null

  const results = await Promise.allSettled(
    TICKERS.map(t =>
      fetch(`/api/finnhub/api/v1/quote?symbol=${t.symbol}&token=${apiKey}`)
        .then(r => r.ok ? r.json() : null)
    )
  )

  return TICKERS.map((t, i) => {
    const q = results[i].status === 'fulfilled' ? results[i].value : null
    if (!q || !q.c) return { ...t, price: null, change: null, pct: null }
    return {
      ...t,
      price: q.c,
      change: q.d ?? 0,
      pct: q.dp ?? 0,
    }
  })
}

function fmt(n) {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return n.toFixed(2)
}

export default function MarketWidget() {
  const [tickers, setTickers] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTickers().then(t => { setTickers(t); setLoading(false) })
    const id = setInterval(() => fetchTickers().then(setTickers), 60 * 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="glass-card market-widget">
      <div className="widget-label">◈ MARKET — LIVE</div>
      {loading ? (
        <div className="widget-loading">FETCHING...</div>
      ) : tickers ? (
        <div className="market-list">
          {tickers.map(t => (
            <div key={t.symbol} className="market-row">
              <span className="market-label">{t.short}</span>
              <span className="market-name">{t.label}</span>
              {t.price != null ? (
                <>
                  <span className="market-price">${fmt(t.price)}</span>
                  <span className={`market-change ${t.change >= 0 ? 'market-up' : 'market-down'}`}>
                    {t.change >= 0 ? '+' : ''}{t.pct.toFixed(2)}%
                  </span>
                </>
              ) : (
                <span className="market-na">—</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="widget-loading">UNAVAILABLE</div>
      )}
    </div>
  )
}
