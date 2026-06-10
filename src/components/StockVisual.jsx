import React, { useEffect, useRef } from 'react'
import { Chart } from 'chart.js'
import '../finance/chartSetup.js'

function MiniChart({ data, color, visible }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)

  useEffect(() => () => { chartRef.current?.destroy(); chartRef.current = null }, [])

  useEffect(() => {
    if (!visible || !data?.length || !canvasRef.current) return
    chartRef.current?.destroy()
    const ctx = canvasRef.current.getContext('2d')
    const grad = ctx.createLinearGradient(0, 0, 0, 44)
    grad.addColorStop(0, color + '44')
    grad.addColorStop(1, color + '00')
    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map((_, i) => i),
        datasets: [{
          data,
          borderColor: color,
          borderWidth: 1.5,
          backgroundColor: grad,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1000, easing: 'easeInOutQuart' },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      },
    })
  }, [data, color, visible])

  return (
    <div style={{ height: 44, position: 'relative', marginTop: 4 }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

function StockRow({ symbol, price, pct, history, showChart, visible }) {
  const up = (pct ?? 0) >= 0
  const color = up ? '#4dffa0' : '#ff4d6d'
  return (
    <div className="sv-row">
      <div className="sv-row-header">
        <span className="sv-symbol">{symbol}</span>
        <span className="sv-price">
          {price != null
            ? `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : '—'}
        </span>
        <span className="sv-pct" style={{ color }}>
          {up ? '▲' : '▼'} {Math.abs(pct ?? 0).toFixed(2)}%
        </span>
      </div>
      {showChart && history?.length > 1 && (
        <MiniChart data={history} color={color} visible={visible} />
      )}
    </div>
  )
}

export default function StockVisual({ stocks, visible, onDismiss }) {
  const timerRef = useRef(null)

  useEffect(() => {
    if (visible) {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onDismiss?.(), 10000)
    }
    return () => clearTimeout(timerRef.current)
  }, [visible, onDismiss])

  return (
    <div className={`visual-panel vp-stocks ${visible ? 'vp-visible' : ''}`} onClick={onDismiss}>
      <span className="vp-label">◈ MARKETS</span>
      {stocks ? (
        <div className="sv-list">
          {stocks.spy && (
            <StockRow symbol="SPY" {...stocks.spy} showChart visible={visible} />
          )}
          {stocks.qqq && (
            <><div className="sv-divider" /><StockRow symbol="QQQ" {...stocks.qqq} /></>
          )}
          {stocks.btc && (
            <><div className="sv-divider" /><StockRow symbol="BTC" {...stocks.btc} /></>
          )}
        </div>
      ) : (
        <div className="sv-loading">FETCHING...</div>
      )}
    </div>
  )
}
