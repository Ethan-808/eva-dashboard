import React, { useRef, useEffect } from 'react'
import { Chart } from 'chart.js'
import '../finance/chartSetup.js'

const PALETTE = ['#00d4ff', '#4dffa0', '#7b6cff', '#ff9f40', '#9ca3af']

const LABELS = {
  checking:    'Checking',
  savings:     'Savings',
  investments: 'Invest.',
  crypto:      'Crypto',
  other:       'Other',
}

function fmt(v) {
  if (v >= 1000000) return `$${(v / 1000000).toFixed(2)}M`
  if (v >= 1000)    return `$${(v / 1000).toFixed(1)}k`
  return `$${v.toFixed(0)}`
}

export default function AssetsDonut({ assets }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)

  const entries = Object.entries(assets).filter(([, v]) => v > 0)
  const hasData = entries.length > 0
  const total   = entries.reduce((s, [, v]) => s + v, 0)

  useEffect(() => {
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    if (!canvasRef.current) return

    const chartData   = hasData ? entries.map(([, v]) => v) : [1]
    const chartColors = hasData
      ? entries.map((_, i) => PALETTE[i % PALETTE.length])
      : ['rgba(20,45,70,0.7)']
    const chartLabels = hasData ? entries.map(([k]) => LABELS[k] || k) : ['Empty']

    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: chartLabels,
        datasets: [{
          data:             chartData,
          backgroundColor:  chartColors,
          borderColor:      'rgba(0,10,30,0.85)',
          borderWidth:      hasData ? 2 : 1,
          hoverBorderWidth: 0,
          hoverOffset:      hasData ? 6 : 0,
        }],
      },
      options: {
        responsive:          false,
        maintainAspectRatio: false,
        cutout:  '66%',
        animation: { duration: 700, easing: 'easeInOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: hasData,
            backgroundColor: 'rgba(0,8,20,0.96)',
            borderColor:     'rgba(0,200,255,0.28)',
            borderWidth: 1,
            titleColor:  'rgba(0,200,255,0.65)',
            bodyColor:   '#d6f4ff',
            padding:     10,
            displayColors: false,
            callbacks: {
              label: item => {
                const pct = total > 0 ? ((item.raw / total) * 100).toFixed(1) : 0
                return `  ${fmt(item.raw)}  (${pct}%)`
              },
            },
          },
        },
      },
    })

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [assets.checking, assets.savings, assets.investments, assets.crypto, assets.other])

  return (
    <div className="donut-wrap">
      <div className="donut-canvas-wrap">
        <canvas ref={canvasRef} width="110" height="110" />
      </div>
      {hasData ? (
        <ul className="donut-legend">
          {entries.map(([k, v], i) => (
            <li key={k} className="donut-legend-row">
              <span className="donut-legend-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="donut-legend-key">{LABELS[k] || k}</span>
              <span className="donut-legend-val">{fmt(v)}</span>
            </li>
          ))}
          <li className="donut-legend-row donut-legend-total">
            <span className="donut-legend-dot" style={{ background: 'transparent' }} />
            <span className="donut-legend-key">Total</span>
            <span className="donut-legend-val">{fmt(total)}</span>
          </li>
        </ul>
      ) : (
        <div className="donut-empty">No assets set, click EDIT to add values.</div>
      )}
    </div>
  )
}
