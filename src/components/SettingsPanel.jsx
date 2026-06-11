import React, { useState, useCallback } from 'react'

const DEFAULTS = {
  wakeWordEnabled: true,
  voiceSpeed: 1.0,
  useBrowserTTS: false,
  responseLength: 'normal',
  morningBriefingTime: '07:00',
  showTokenUsage: true,
}

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('eva_settings') || '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

function saveSettings(s) {
  localStorage.setItem('eva_settings', JSON.stringify(s))
}

export default function SettingsPanel({ visible, onClose, apiCallCount, onSettingsChange }) {
  const [settings, setSettings] = useState(loadSettings)

  const update = useCallback((key, value) => {
    const next = { ...settings, [key]: value }
    setSettings(next)
    saveSettings(next)
    onSettingsChange?.(key, value, next)
  }, [settings, onSettingsChange])

  const tokens = apiCallCount * 500
  const cost = (tokens / 1000) * 0.003

  return (
    <div className={`panel panel-settings ${visible ? 'panel-visible' : ''}`}>
      <div className="settings-header">
        <span className="settings-title">◈ SETTINGS</span>
        <button className="panel-close" style={{ position: 'static' }} onClick={onClose}>✕</button>
      </div>

      <div className="settings-body">
        <SettingRow label="WAKE WORD">
          <Toggle value={settings.wakeWordEnabled} onChange={v => update('wakeWordEnabled', v)} />
        </SettingRow>

        <SettingRow label="VOICE SPEED">
          <input
            type="range" min="0.8" max="1.3" step="0.05"
            value={settings.voiceSpeed}
            onChange={e => update('voiceSpeed', parseFloat(e.target.value))}
            className="settings-slider"
          />
          <span className="settings-value">{settings.voiceSpeed.toFixed(2)}x</span>
        </SettingRow>

        <SettingRow label="TTS ENGINE">
          <div className="settings-toggle-group">
            <button
              className={`settings-btn ${!settings.useBrowserTTS ? 'settings-btn-active' : ''}`}
              onClick={() => update('useBrowserTTS', false)}
            >ELEVENLABS</button>
            <button
              className={`settings-btn ${settings.useBrowserTTS ? 'settings-btn-active' : ''}`}
              onClick={() => update('useBrowserTTS', true)}
            >BROWSER</button>
          </div>
        </SettingRow>

        <SettingRow label="RESPONSE">
          <div className="settings-toggle-group">
            {['brief', 'normal', 'detailed'].map(l => (
              <button
                key={l}
                className={`settings-btn ${settings.responseLength === l ? 'settings-btn-active' : ''}`}
                onClick={() => update('responseLength', l)}
              >{l.toUpperCase()}</button>
            ))}
          </div>
        </SettingRow>

        <SettingRow label="AM BRIEFING">
          <input
            type="time"
            value={settings.morningBriefingTime}
            onChange={e => update('morningBriefingTime', e.target.value)}
            className="settings-time-input"
          />
        </SettingRow>

        <SettingRow label="TOKEN USAGE">
          <Toggle value={settings.showTokenUsage} onChange={v => update('showTokenUsage', v)} />
        </SettingRow>

        {settings.showTokenUsage && (
          <div className="settings-token-display">
            {apiCallCount} API · {tokens >= 1000 ? `~${(tokens / 1000).toFixed(1)}k` : tokens} tok · {cost < 0.01 ? '<$0.01' : `$${cost.toFixed(3)}`}
          </div>
        )}
      </div>
    </div>
  )
}

function SettingRow({ label, children }) {
  return (
    <div className="settings-row">
      <span className="settings-label">{label}</span>
      <div className="settings-control">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      className={`settings-toggle ${value ? 'settings-toggle-on' : ''}`}
      onClick={() => onChange(!value)}
    >
      <span className="settings-toggle-knob" />
    </button>
  )
}
