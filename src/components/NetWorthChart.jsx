import React, { useRef, useEffect, useState } from 'react'
import { Chart } from 'chart.js'
import '../finance/chartSetup.js'

const RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: 'ALL', days: Infinity },
]

function filterHistory(history, days) {
  if (days === Infinity || !history.length) return history
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const filtered = history.filter(h => h.date >= cutoffStr)
  return filtered.length ? filtered : history
}

function fmtTick(v) {
  const abs = Math.abs(v)
  if (abs >= 1000000) return `$${(v / 1000000).toFixed(1)}M`
  if (abs >= 1000)    return `$${(v / 1000).toFixed(0)}k`
  return `$${v}`
}

function fmtTooltip(v) {
  const abs = Math.abs(v)
  if (abs >= 1000000) return `$${(v / 1000000).toFixed(2)}M`
  if (abs >= 1000)    return `$${(v / 1000).toFixed(1)}k`
  return `$${v.toFixed(0)}`
}

export default function NetWorthChart({ history = [] }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)
  const [range, setRange] = useState('ALL')

  // Seed with today + $0 so the chart always has at least one point
  const today = new Date().toISOString().slice(0, 10)
  const displayHistory = history.length > 0 ? history : [{ date: today, amount: 0 }]

  // Destroy only on unmount
  useEffect(() => {
    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [])

  // Create or update chart when data/range changes
  useEffect(() => {
    const rangeDays = RANGES.find(r => r.label === range)?.days ?? Infinity
    const data = filterHistory(displayHistory, rangeDays)
    const labels = data.map(p => p.date)
    const values = data.map(p => p.amount)
    const pointRadius = data.length > 30 ? 0 : 3

    if (chartRef.current) {
      chartRef.current.data.labels = labels
      chartRef.current.data.datasets[0].data = values
      chartRef.current.data.datasets[0].pointRadius = pointRadius
      chartRef.current.update()
      return
    }

    if (!canvasRef.current) return

    const ctx = canvasRef.current.getContext('2d')
    const h   = 150

    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0,   'rgba(0,212,255,0.22)')
    grad.addColorStop(0.7, 'rgba(0,212,255,0.04)')
    grad.addColorStop(1,   'rgba(0,212,255,0.00)')

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: '#00d4ff',
          borderWidth: 2,
          backgroundColor: grad,
          fill: true,
          tension: 0.42,
          pointRadius,
          pointBackgroundColor: '#00d4ff',
          pointBorderColor: 'rgba(0,10,30,0.85)',
          pointBorderWidth: 1,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: '#00d4ff',
          pointHoverBorderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeInOutQuart' },
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,8,20,0.96)',
            borderColor: 'rgba(0,200,255,0.28)',
            borderWidth: 1,
            titleColor: 'rgba(0,200,255,0.65)',
            bodyColor: '#d6f4ff',
            padding: 10,
            displayColors: false,
            callbacks: {
              label: item => `  Net Worth: ${fmtTooltip(item.raw)}`,
            },
          },
        },
        scales: {
          x: {
            grid:   { color: 'rgba(0,200,255,0.05)', drawTicks: false },
            border: { display: false },
            ticks: {
              color: 'rgba(160,220,240,0.45)',
              font: { size: 8, family: 'monospace' },
              maxTicksLimit: 6,
              maxRotation: 0,
            },
          },
          y: {
            position: 'right',
            grid:   { color: 'rgba(0,200,255,0.05)', drawTicks: false },
            border: { display: false },
            ticks: {
              color: 'rgba(160,220,240,0.45)',
              font: { size: 8, family: 'monospace' },
              maxTicksLimit: 4,
              callback: fmtTick,
            },
          },
        },
      },
    })
  }, [history, range])

  return (
    <div className="nw-chart-wrap">
      <div className="nw-chart-header">
        <span className="finance-stat-label">NET WORTH OVER TIME</span>
        <div className="nw-range-tabs">
          {RANGES.map(r => (
            <button
              key={r.label}
              className={`nw-range-tab${range === r.label ? ' active' : ''}`}
              onClick={() => setRange(r.label)}
            >{r.label}</button>
          ))}
        </div>
      </div>

      <div className="nw-canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
