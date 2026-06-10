import React, { useState, useEffect } from 'react'
import { getData, getNetWorth, getMonthlyBurn, getMonthlyIncome, snapshotNetWorth, saveData } from '../finance/data.js'
import NetWorthChart from './NetWorthChart'
import AssetsDonut from './AssetsDonut'

function fmtCompact(n) {
  const abs = Math.abs(n)
  if (abs >= 1000000) return `$${(n / 1000000).toFixed(2)}M`
  if (abs >= 1000)    return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

export default function FinanceWidget() {
  const [data, setData]         = useState(getData)
  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft]       = useState(null)
  const [chartsOpen, setChartsOpen] = useState(false)

  useEffect(() => {
    snapshotNetWorth()

    const onUpdate = () => setData(getData())
    const onExpand = () => setChartsOpen(true)

    window.addEventListener('eva-finance-update', onUpdate)
    window.addEventListener('eva-finance-expand', onExpand)
    return () => {
      window.removeEventListener('eva-finance-update', onUpdate)
      window.removeEventListener('eva-finance-expand', onExpand)
    }
  }, [])

  const nw          = getNetWorth(data)
  const burn        = getMonthlyBurn(data)
  const income      = getMonthlyIncome(data)
  const totalAssets = Object.values(data.assets).reduce((a, b) => a + b, 0)
  const totalLiabs  = Object.values(data.liabilities).reduce((a, b) => a + b, 0)

  function openEdit() {
    setDraft({
      assets:        { ...data.assets },
      liabilities:   { ...data.liabilities },
      subscriptions: data.subscriptions.map(s => ({ ...s })),
    })
    setEditOpen(true)
  }

  function saveEdit() {
    saveData({ ...data, assets: draft.assets, liabilities: draft.liabilities, subscriptions: draft.subscriptions })
    setData(getData())
    snapshotNetWorth()
    setEditOpen(false)
  }

  return (
    <>
      <div className="glass-card finance-widget">
        <div className="finance-header">
          <span className="widget-label" style={{ margin: 0 }}>◈ FINANCES</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`finance-charts-btn${chartsOpen ? ' active' : ''}`}
              onClick={() => setChartsOpen(c => !c)}
            >
              {chartsOpen ? '▲ CHARTS' : '▼ CHARTS'}
            </button>
            <button className="finance-edit-btn" onClick={openEdit}>EDIT</button>
          </div>
        </div>

        <div className="finance-stats">
          <div className="finance-stat">
            <span className="finance-stat-label">NET WORTH</span>
            <span className={`finance-stat-value ${nw >= 0 ? 'finance-pos' : 'finance-neg'}`}>
              {fmtCompact(nw)}
            </span>
          </div>

          <div className="finance-divider" />

          <div className="finance-stat">
            <span className="finance-stat-label">ASSETS</span>
            <span className="finance-stat-value">{fmtCompact(totalAssets)}</span>
          </div>

          <div className="finance-divider" />

          <div className="finance-stat">
            <span className="finance-stat-label">LIABILITIES</span>
            <span className={`finance-stat-value ${totalLiabs > 0 ? 'finance-neg' : ''}`}>
              {fmtCompact(totalLiabs)}
            </span>
          </div>

          <div className="finance-divider" />

          <div className="finance-stat">
            <span className="finance-stat-label">MONTHLY BURN</span>
            <span className="finance-stat-value finance-neg">${burn.toFixed(0)}/mo</span>
          </div>

          {income > 0 && (
            <>
              <div className="finance-divider" />
              <div className="finance-stat">
                <span className="finance-stat-label">INCOME THIS MO</span>
                <span className="finance-stat-value finance-pos">{fmtCompact(income)}</span>
              </div>
            </>
          )}

          <div className="finance-divider" />

          <div className="finance-subs">
            {data.subscriptions.map((s, i) => (
              <span key={i} className="finance-sub-tag">
                {s.name}&nbsp;${s.amount}
              </span>
            ))}
          </div>
        </div>

        <div className="finance-charts" style={chartsOpen ? undefined : { display: 'none' }}>
          <NetWorthChart history={data.netWorthHistory} />
          <div className="finance-charts-bottom">
            <div className="finance-charts-donut-col">
              <span className="finance-stat-label" style={{ marginBottom: 8, display: 'block' }}>ASSET BREAKDOWN</span>
              <AssetsDonut assets={data.assets} />
            </div>
          </div>
        </div>
      </div>

      {editOpen && (
        <div className="finance-modal-backdrop" onClick={() => setEditOpen(false)}>
          <div className="finance-modal" onClick={e => e.stopPropagation()}>
            <div className="finance-modal-header">
              <span className="widget-label" style={{ margin: 0 }}>◈ EDIT FINANCES</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="finance-modal-btn finance-modal-save" onClick={saveEdit}>SAVE</button>
                <button className="finance-modal-btn" onClick={() => setEditOpen(false)}>CANCEL</button>
              </div>
            </div>

            <div className="finance-modal-body">
              <EditSection
                heading="ASSETS"
                entries={draft.assets}
                onChange={(k, v) => setDraft(d => ({ ...d, assets: { ...d.assets, [k]: v } }))}
              />
              <EditSection
                heading="LIABILITIES"
                entries={draft.liabilities}
                onChange={(k, v) => setDraft(d => ({ ...d, liabilities: { ...d.liabilities, [k]: v } }))}
              />

              <div className="finance-edit-section">
                <div className="finance-edit-heading">SUBSCRIPTIONS</div>
                {draft.subscriptions.map((s, i) => (
                  <div key={i} className="finance-sub-edit-row">
                    <input
                      className="finance-edit-input finance-sub-name"
                      value={s.name}
                      onChange={e => setDraft(d => {
                        const subs = d.subscriptions.map((x, j) => j === i ? { ...x, name: e.target.value } : x)
                        return { ...d, subscriptions: subs }
                      })}
                    />
                    <input
                      className="finance-edit-input finance-sub-amount"
                      type="number"
                      min="0"
                      value={s.amount}
                      onChange={e => setDraft(d => {
                        const subs = d.subscriptions.map((x, j) => j === i ? { ...x, amount: parseFloat(e.target.value) || 0 } : x)
                        return { ...d, subscriptions: subs }
                      })}
                    />
                    <button
                      className="finance-sub-del"
                      onClick={() => setDraft(d => ({ ...d, subscriptions: d.subscriptions.filter((_, j) => j !== i) }))}
                    >✕</button>
                  </div>
                ))}
                <button
                  className="finance-sub-add"
                  onClick={() => setDraft(d => ({
                    ...d,
                    subscriptions: [...d.subscriptions, { name: '', amount: 0, billingCycle: 'monthly' }],
                  }))}
                >+ ADD</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function EditSection({ heading, entries, onChange }) {
  return (
    <div className="finance-edit-section">
      <div className="finance-edit-heading">{heading}</div>
      {Object.entries(entries).map(([k, v]) => (
        <div key={k} className="finance-edit-row">
          <span className="finance-edit-key">{k.replace(/([A-Z])/g, ' $1').toUpperCase()}</span>
          <input
            className="finance-edit-input"
            type="number"
            min="0"
            value={v}
            onChange={e => onChange(k, parseFloat(e.target.value) || 0)}
          />
        </div>
      ))}
    </div>
  )
}
