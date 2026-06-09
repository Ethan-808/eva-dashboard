import React, { useState, useRef, useCallback, useEffect } from 'react'
import Waveform from './components/Waveform'
import ConversationLog from './components/ConversationLog'
import {
  classifyIntent, getMaxTokens,
  handleTime, handleWeather, handleNews, handleCalendar, handleMath, handleGreeting, handleStocks,
} from './intent.js'
import { getCached, setCached } from './cache.js'

const SYSTEM_PROMPT =
  'You are EVA, a personal AI assistant for Ethan Yang, a Stanford freshman and entrepreneur based in Honolulu, Hawaii. Be concise, smart, and direct — keep spoken answers short. Ethan is juggling a Hawaii state senate internship, a startup accelerator, and content creation. You have tools available — use them proactively when they would help answer the question accurately.'

const MODEL = 'claude-sonnet-4-6'
const API_URL = '/api/anthropic/v1/messages'
const ELEVENLABS_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'
const HISTORY_LIMIT = 6
const TOKENS_PER_CALL = 500
const COST_PER_1K = 0.003

const TOOLS = [
  {
    name: 'get_time',
    description: 'Get the current date and time. Always includes Hawaii time since that is where Ethan is based.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_weather',
    description: 'Get the current weather conditions for a city or location.',
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City or location name, e.g. "Honolulu" or "Palo Alto, CA"' },
      },
      required: ['location'],
    },
  },
  {
    name: 'save_note',
    description: "Save a note or reminder for Ethan to refer to later.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title or label for the note' },
        content: { type: 'string', description: 'Full content of the note' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'get_notes',
    description: "Retrieve all of Ethan's saved notes.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'delete_note',
    description: 'Delete a saved note by its index number.',
    input_schema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Zero-based index of the note to delete' },
      },
      required: ['index'],
    },
  },
]

async function executeTool(name, input) {
  switch (name) {
    case 'get_time': {
      const now = new Date()
      const hst = now.toLocaleString('en-US', { timeZone: 'Pacific/Honolulu', dateStyle: 'full', timeStyle: 'long' })
      return `Hawaii time: ${hst}\nUTC: ${now.toUTCString()}`
    }
    case 'get_weather': {
      try {
        const loc = encodeURIComponent(input.location)
        const res = await fetch(`https://wttr.in/${loc}?format=j1`)
        if (!res.ok) return `Could not fetch weather for "${input.location}"`
        const data = await res.json()
        const c = data.current_condition[0]
        const area = data.nearest_area?.[0]?.areaName?.[0]?.value || input.location
        const country = data.nearest_area?.[0]?.country?.[0]?.value || ''
        return `${area}${country ? ', ' + country : ''}: ${c.weatherDesc[0].value}, ${c.temp_F}°F (feels like ${c.FeelsLikeF}°F), humidity ${c.humidity}%, wind ${c.windspeedMiles} mph`
      } catch (e) { return `Weather lookup failed: ${e.message}` }
    }
    case 'save_note': {
      const notes = JSON.parse(localStorage.getItem('eva_notes') || '[]')
      notes.push({ title: input.title, content: input.content, created: new Date().toISOString() })
      localStorage.setItem('eva_notes', JSON.stringify(notes))
      return `Note saved (index ${notes.length - 1}): "${input.title}"`
    }
    case 'get_notes': {
      const notes = JSON.parse(localStorage.getItem('eva_notes') || '[]')
      if (notes.length === 0) return 'No notes saved.'
      return notes.map((n, i) => `[${i}] ${n.title}: ${n.content} (saved ${new Date(n.created).toLocaleDateString()})`).join('\n')
    }
    case 'delete_note': {
      const notes = JSON.parse(localStorage.getItem('eva_notes') || '[]')
      const idx = Number(input.index)
      if (idx < 0 || idx >= notes.length) return `No note at index ${idx}`
      const [removed] = notes.splice(idx, 1)
      localStorage.setItem('eva_notes', JSON.stringify(notes))
      return `Deleted note: "${removed.title}"`
    }
    default: return `Unknown tool: ${name}`
  }
}

const STATUS_HINTS = {
  idle: 'PRESS TO SPEAK',
  listening: 'LISTENING...',
  loading: 'PROCESSING...',
  speaking: 'SPEAKING...',
}

export default function App() {
  const [status, setStatus] = useState('idle')
  const [wakeMode, setWakeMode] = useState('off') // 'off' | 'passive' | 'awake'
  const [conversation, setConversation] = useState([])
  const [interimText, setInterimText] = useState('')
  const [activeTools, setActiveTools] = useState([])
  const [textInput, setTextInput] = useState('')
  const [speechError, setSpeechError] = useState('')
  const [apiCallCount, setApiCallCount] = useState(0)
  const [cacheHits, setCacheHits] = useState(0)

  const statusRef = useRef('idle')
  const wakeModeRef = useRef('off')
  const conversationRef = useRef([])
  const apiHistoryRef = useRef([])
  const recognitionRef = useRef(null)   // active listening
  const passiveRef = useRef(null)       // passive/wake-word listening
  const audioRef = useRef(null)

  // Stable refs to latest function versions — breaks circular dependency
  const startListeningRef = useRef(null)
  const startPassiveRef = useRef(null)

  const updateStatus = useCallback((s) => { statusRef.current = s; setStatus(s) }, [])
  const updateWakeMode = useCallback((m) => { wakeModeRef.current = m; setWakeMode(m) }, [])

  const addMessage = useCallback((msg) => {
    const entry = { ...msg, timestamp: new Date() }
    conversationRef.current = [...conversationRef.current, entry]
    setConversation([...conversationRef.current])
    apiHistoryRef.current = [...apiHistoryRef.current, { role: msg.role, content: msg.content }]
    return entry
  }, [])

  const addDisplayMessage = useCallback((msg) => {
    const entry = { ...msg, timestamp: new Date() }
    conversationRef.current = [...conversationRef.current, entry]
    setConversation([...conversationRef.current])
  }, [])

  const stopAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    window.speechSynthesis.cancel()
  }, [])

  // speak(text, { newsRate: false })
  const speak = useCallback(async (text, { newsRate = false } = {}) => {
    stopAudio()
    const elevenKey = import.meta.env.VITE_ELEVENLABS_API_KEY

    if (elevenKey) {
      try {
        updateStatus('speaking')
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
          {
            method: 'POST',
            headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              model_id: 'eleven_turbo_v2_5',
              voice_settings: { stability: 0.4, similarity_boost: 0.8 },
            }),
          }
        )
        if (!res.ok) throw new Error(`ElevenLabs ${res.status}`)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => {
          URL.revokeObjectURL(url)
          audioRef.current = null
          updateStatus('idle')
          // Return to passive listening after response
          startPassiveRef.current?.()
        }
        audio.onerror = () => {
          URL.revokeObjectURL(url)
          audioRef.current = null
          updateStatus('idle')
          startPassiveRef.current?.()
        }
        await audio.play()
        return
      } catch (err) {
        console.error('[EVA TTS]', err)
        updateStatus('idle')
        startPassiveRef.current?.()
      }
    }

    // Browser TTS fallback
    const synth = window.speechSynthesis
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = newsRate ? 1.4 : 1.3
    utter.pitch = 0.88
    utter.volume = 1
    const applyVoice = () => {
      const voices = synth.getVoices()
      const pick =
        voices.find((v) => v.name.includes('Daniel') && v.lang.startsWith('en')) ||
        voices.find((v) => v.name.includes('Google') && v.lang === 'en-US') ||
        voices.find((v) => v.lang === 'en-US')
      if (pick) utter.voice = pick
    }
    if (synth.getVoices().length > 0) applyVoice()
    else synth.onvoiceschanged = applyVoice
    utter.onstart = () => updateStatus('speaking')
    utter.onend = () => { updateStatus('idle'); startPassiveRef.current?.() }
    utter.onerror = () => { updateStatus('idle'); startPassiveRef.current?.() }
    synth.speak(utter)
  }, [stopAudio, updateStatus])

  const sendToEva = useCallback(async (userText) => {
    updateStatus('loading')
    setInterimText('')
    setActiveTools([])
    updateWakeMode('off') // clear awake indicator while processing

    // ── 1. Intent detection ────────────────────────────────────────────
    const intent = classifyIntent(userText)
    if (intent) {
      let response
      try {
        if (intent === 'time') response = await handleTime()
        else if (intent === 'weather') response = await handleWeather(userText)
        else if (intent === 'news') response = await handleNews()
        else if (intent === 'calendar') response = handleCalendar()
        else if (intent === 'math') response = handleMath(userText) || null
        else if (intent === 'stocks') response = await handleStocks(userText)
        else if (intent === 'greeting') response = handleGreeting()
      } catch {}

      if (response) {
        addDisplayMessage({ role: 'user', content: userText })
        addDisplayMessage({ role: 'assistant', content: response, isIntent: true })
        speak(response, { newsRate: intent === 'news' })
        return
      }
    }

    // ── 2. Response cache ──────────────────────────────────────────────
    const cached = getCached(userText)
    if (cached) {
      setCacheHits((n) => n + 1)
      addDisplayMessage({ role: 'user', content: userText })
      addDisplayMessage({ role: 'assistant', content: cached, isCached: true })
      speak(cached) // passive restarts inside speak's onended/onerror
      return
    }

    // ── 3. Claude API call ─────────────────────────────────────────────
    addMessage({ role: 'user', content: userText })
    try {
      let history = apiHistoryRef.current.slice(-HISTORY_LIMIT)
      while (history.length && history[0].role !== 'user') history = history.slice(1)
      const maxTokens = getMaxTokens(userText)
      let apiMsgs = history.map((m) => ({ role: m.role, content: m.content }))
      let finalText = null

      while (true) {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': import.meta.env.VITE_CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: SYSTEM_PROMPT, tools: TOOLS, messages: apiMsgs }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error?.message || `HTTP ${res.status}`)
        }
        const data = await res.json()
        if (data.stop_reason === 'tool_use') {
          const toolUseBlocks = data.content.filter((b) => b.type === 'tool_use')
          setActiveTools(toolUseBlocks.map((b) => b.name))
          apiMsgs = [...apiMsgs, { role: 'assistant', content: data.content }]
          const toolResults = await Promise.all(
            toolUseBlocks.map(async (block) => ({
              type: 'tool_result',
              tool_use_id: block.id,
              content: await executeTool(block.name, block.input),
            }))
          )
          apiMsgs = [...apiMsgs, { role: 'user', content: toolResults }]
          apiHistoryRef.current = [
            ...apiHistoryRef.current,
            { role: 'assistant', content: data.content },
            { role: 'user', content: toolResults },
          ]
          setActiveTools([])
          continue
        }
        finalText = data.content.find((b) => b.type === 'text')?.text ?? '[No response]'
        break
      }

      setApiCallCount((n) => n + 1)
      setCached(userText, finalText)
      addMessage({ role: 'assistant', content: finalText })
      speak(finalText)
    } catch (err) {
      console.error('[EVA]', err)
      setActiveTools([])
      addMessage({ role: 'assistant', content: `[ERROR] ${err.message}`, isError: true })
      updateStatus('idle')
      startPassiveRef.current?.()
    }
  }, [addMessage, addDisplayMessage, speak, updateStatus, updateWakeMode])

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Speech recognition not supported. Use Chrome or Edge.'); return }

    // Stop passive if running
    if (passiveRef.current) { passiveRef.current.abort(); passiveRef.current = null }
    if (recognitionRef.current) recognitionRef.current.abort()

    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.maxAlternatives = 1
    rec.onstart = () => updateStatus('listening')
    rec.onresult = (e) => {
      let interim = '', final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      setInterimText(interim || final)
      if (final.trim()) { recognitionRef.current = null; sendToEva(final.trim()) }
    }
    rec.onerror = (e) => {
      if (e.error !== 'aborted') {
        console.error('Speech error:', e.error)
        updateStatus('idle')
        setInterimText('')
        setSpeechError(e.error)
        setTimeout(() => setSpeechError(''), 4000)
        startPassiveRef.current?.()
      }
    }
    rec.onend = () => {
      if (statusRef.current === 'listening') {
        updateStatus('idle')
        setInterimText('')
        startPassiveRef.current?.()
      }
    }
    recognitionRef.current = rec
    rec.start()
  }, [sendToEva, updateStatus])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null }
    updateStatus('idle')
    setInterimText('')
    // Return to passive after manually stopping
    setTimeout(() => startPassiveRef.current?.(), 300)
  }, [updateStatus])

  const stopPassiveListening = useCallback(() => {
    if (passiveRef.current) { passiveRef.current.abort(); passiveRef.current = null }
    updateWakeMode('off')
  }, [updateWakeMode])

  const startPassiveListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    // Don't start passive if actively doing something
    if (['listening', 'loading', 'speaking'].includes(statusRef.current)) return
    if (passiveRef.current) { passiveRef.current.abort(); passiveRef.current = null }

    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.maxAlternatives = 1

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript.toLowerCase()
        if (/hey[\s,]*eva/.test(transcript)) {
          rec.abort()
          passiveRef.current = null
          updateWakeMode('awake')
          setTimeout(() => startListeningRef.current?.(), 250)
          return
        }
      }
    }

    rec.onend = () => {
      // Auto-restart passive unless we've moved to active listening/loading/speaking
      if (passiveRef.current === rec && wakeModeRef.current === 'passive') {
        setTimeout(() => {
          if (wakeModeRef.current === 'passive') startPassiveRef.current?.()
        }, 300)
      }
    }

    rec.onerror = (e) => {
      if (e.error !== 'aborted' && passiveRef.current === rec) {
        passiveRef.current = null
        setTimeout(() => {
          if (wakeModeRef.current === 'passive') startPassiveRef.current?.()
        }, 2000)
      }
    }

    passiveRef.current = rec
    updateWakeMode('passive')
    try {
      rec.start()
    } catch (err) {
      // start() threw synchronously (e.g. NotAllowedError before permission granted)
      passiveRef.current = null
      updateWakeMode('off')
    }
  }, [updateWakeMode])

  // Keep latest function refs up to date every render
  startListeningRef.current = startListening
  startPassiveRef.current = startPassiveListening

  // Auto-start passive listening on mount — only if mic already permitted
  useEffect(() => {
    navigator.permissions?.query({ name: 'microphone' })
      .then((result) => {
        if (result.state === 'granted') startPassiveRef.current?.()
        // If state changes to granted later (user clicks mic), passive starts via handleMicClick
        result.onchange = () => {
          if (result.state === 'granted' && wakeModeRef.current === 'off') {
            startPassiveRef.current?.()
          }
        }
      })
      .catch(() => {
        // Permissions API not supported — passive will start after first mic interaction
      })
    return () => {
      if (passiveRef.current) { passiveRef.current.abort(); passiveRef.current = null }
    }
  }, []) // intentional — run once on mount

  const handleMicClick = useCallback(() => {
    if (status === 'listening') { stopListening(); startPassiveListening() }
    else if (status === 'speaking') { stopAudio(); updateStatus('idle'); startPassiveListening() }
    else if (status === 'idle') { stopPassiveListening(); startListening() }
  }, [status, startListening, stopListening, startPassiveListening, stopPassiveListening, stopAudio, updateStatus])

  const handleTextSend = useCallback(() => {
    const text = textInput.trim()
    if (!text || status === 'loading' || status === 'listening') return
    stopPassiveListening()
    setTextInput('')
    sendToEva(text)
  }, [textInput, status, sendToEva, stopPassiveListening])

  const handleTextKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSend() }
  }, [handleTextSend])

  const isActive = status === 'listening' || status === 'speaking'

  // Token counter math
  const estimatedTokens = apiCallCount * TOKENS_PER_CALL
  const estimatedCost = (estimatedTokens / 1000) * COST_PER_1K
  const tokenDisplay = estimatedTokens >= 1000
    ? `~${(estimatedTokens / 1000).toFixed(1)}k`
    : `~${estimatedTokens}`
  const costDisplay = estimatedCost < 0.01
    ? `<0.1¢`
    : `~${(estimatedCost * 100).toFixed(1)}¢`

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo">
          <span className="logo-diamond">◈</span>
          <span className="logo-text">EVA</span>
        </div>
        <div className="header-right">
          <span className={`status-dot status-dot-${status}`} />
          <span className="status-label">{status.toUpperCase()}</span>
        </div>
      </header>

      <main className="main">
        <div className="visualizer">
          <Waveform active={isActive} type={status} />
        </div>

        <div className="mic-area">
          <button
            className={`mic-btn mic-btn-${status}`}
            onClick={handleMicClick}
            disabled={status === 'loading'}
            aria-label={status === 'listening' ? 'Stop' : 'Speak to EVA'}
          >
            {status === 'loading' ? <span className="spinner" /> : status === 'listening' ? <StopIcon /> : <MicIcon />}
          </button>
          <p className="mic-hint">
            {activeTools.length > 0
              ? `RUNNING: ${activeTools.map((t) => t.replace(/_/g, ' ').toUpperCase()).join(', ')}`
              : STATUS_HINTS[status]}
          </p>
          <div className={`wake-indicator wake-indicator-${wakeMode === 'off' ? 'off' : wakeMode}`}>
            <span className="wake-dot" />
            <span className="wake-label">
              {wakeMode === 'passive' ? 'PASSIVE — say "Hey EVA"' : wakeMode === 'awake' ? 'AWAKE' : 'click mic to enable wake word'}
            </span>
          </div>
        </div>

        {interimText && (
          <div className="interim">
            <span className="interim-caret">›</span> {interimText}
          </div>
        )}

        {speechError && (
          <div className="speech-error">
            MIC ERROR: {speechError.replace(/-/g, ' ').toUpperCase()}
          </div>
        )}

        <div className="text-input-row">
          <input
            className="text-input"
            type="text"
            placeholder="Or type here and press Enter..."
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleTextKeyDown}
            disabled={status === 'loading' || status === 'listening'}
          />
          <button
            className="send-btn"
            onClick={handleTextSend}
            disabled={!textInput.trim() || status === 'loading' || status === 'listening'}
          >
            ›
          </button>
        </div>

        <ConversationLog conversation={conversation} />
      </main>

      {/* Token counter — bottom right corner */}
      <div className="token-strip">
        <span className="ts-item ts-api">
          <span className="ts-label">API</span>
          <span className="ts-val">{apiCallCount}</span>
        </span>
        <span className="ts-sep">·</span>
        <span className="ts-item">
          <span className="ts-val">{tokenDisplay}</span>
          <span className="ts-label"> tok</span>
        </span>
        <span className="ts-sep">·</span>
        <span className="ts-item ts-cost">
          <span className="ts-val">{costDisplay}</span>
        </span>
        {cacheHits > 0 && (
          <>
            <span className="ts-sep">·</span>
            <span className="ts-item ts-cache" title="Cache hits this session">
              <span className="ts-val">↺{cacheHits}</span>
            </span>
          </>
        )}
      </div>
    </div>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="30" height="30" aria-hidden>
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}
