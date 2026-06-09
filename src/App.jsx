import React, { useState, useRef, useCallback, useEffect } from 'react'
import EvaOrb3D from './components/EvaOrb3D'
import ClockWidget from './components/ClockWidget'
import WeatherWidget from './components/WeatherWidget'
import MarketWidget from './components/MarketWidget'
import NowPlaying from './components/NowPlaying'
import ConversationLog from './components/ConversationLog'
import StatusBar from './components/StatusBar'
import {
  classifyIntent, getMaxTokens,
  handleTime, handleWeather, handleNews, handleCalendar, handleMath, handleGreeting, handleStocks,
} from './intent.js'
import { getCached, setCached } from './cache.js'
import { initiateLogin, handleCallback, isAuthenticated } from './spotify/auth.js'
import { initPlayer, getDeviceId, togglePlay, nextTrack, previousTrack } from './spotify/player.js'
import { handleMusicCommand } from './spotify/commands.js'

const SYSTEM_PROMPT =
  'You are EVA, a personal AI assistant for Ethan Yang, a Stanford freshman and entrepreneur based in Honolulu, Hawaii. Be concise, smart, and direct — keep spoken answers short. Ethan is juggling a Hawaii state senate internship, a startup accelerator, and content creation. You have tools available — use them proactively when they would help answer the question accurately.'

const MODEL = 'claude-sonnet-4-6'
const API_URL = '/api/anthropic/v1/messages'
const ELEVENLABS_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'
const HISTORY_LIMIT = 6
const TOKENS_PER_CALL = 500

const TOOLS = [
  {
    name: 'get_time',
    description: 'Get the current date and time in Hawaii.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_weather',
    description: 'Get current weather for a city.',
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City or location name' },
      },
      required: ['location'],
    },
  },
  {
    name: 'save_note',
    description: "Save a note or reminder.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'get_notes',
    description: "Retrieve all saved notes.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'delete_note',
    description: 'Delete a note by index.',
    input_schema: {
      type: 'object',
      properties: {
        index: { type: 'number' },
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
        return `${area}: ${c.weatherDesc[0].value}, ${c.temp_F}°F (feels like ${c.FeelsLikeF}°F), humidity ${c.humidity}%, wind ${c.windspeedMiles} mph`
      } catch (e) { return `Weather lookup failed: ${e.message}` }
    }
    case 'save_note': {
      const notes = JSON.parse(localStorage.getItem('eva_notes') || '[]')
      notes.push({ title: input.title, content: input.content, created: new Date().toISOString() })
      localStorage.setItem('eva_notes', JSON.stringify(notes))
      return `Note saved: "${input.title}"`
    }
    case 'get_notes': {
      const notes = JSON.parse(localStorage.getItem('eva_notes') || '[]')
      if (notes.length === 0) return 'No notes saved.'
      return notes.map((n, i) => `[${i}] ${n.title}: ${n.content}`).join('\n')
    }
    case 'delete_note': {
      const notes = JSON.parse(localStorage.getItem('eva_notes') || '[]')
      const idx = Number(input.index)
      if (idx < 0 || idx >= notes.length) return `No note at index ${idx}`
      const [removed] = notes.splice(idx, 1)
      localStorage.setItem('eva_notes', JSON.stringify(notes))
      return `Deleted: "${removed.title}"`
    }
    default: return `Unknown tool: ${name}`
  }
}

export default function App() {
  const [status, setStatus] = useState('idle')
  const [wakeMode, setWakeMode] = useState('off')
  const [conversation, setConversation] = useState([])
  const [interimText, setInterimText] = useState('')
  const [activeTools, setActiveTools] = useState([])
  const [textInput, setTextInput] = useState('')
  const [speechError, setSpeechError] = useState('')
  const [apiCallCount, setApiCallCount] = useState(0)
  const [cacheHits, setCacheHits] = useState(0)
  const [spotifyAuth, setSpotifyAuth] = useState(isAuthenticated())
  const [playerState, setPlayerState] = useState(null)
  const [volume, setVolume] = useState(50)

  const statusRef = useRef('idle')
  const wakeModeRef = useRef('off')
  const conversationRef = useRef([])
  const apiHistoryRef = useRef([])
  const recognitionRef = useRef(null)
  const passiveRef = useRef(null)
  const audioRef = useRef(null)
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
        audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; updateStatus('idle'); startPassiveRef.current?.() }
        audio.onerror = () => { URL.revokeObjectURL(url); audioRef.current = null; updateStatus('idle'); startPassiveRef.current?.() }
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
    const applyVoice = () => {
      const voices = synth.getVoices()
      const pick = voices.find(v => v.name.includes('Google') && v.lang === 'en-US') || voices.find(v => v.lang === 'en-US')
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
    updateWakeMode('off')

    // 1. Intent detection
    const intent = classifyIntent(userText)
    if (intent) {
      let response
      try {
        if (intent === 'time')     response = await handleTime()
        else if (intent === 'weather')  response = await handleWeather(userText)
        else if (intent === 'news')     response = await handleNews()
        else if (intent === 'calendar') response = handleCalendar()
        else if (intent === 'math')     response = handleMath(userText) || null
        else if (intent === 'stocks')   response = await handleStocks(userText)
        else if (intent === 'greeting') response = handleGreeting()
        else if (intent === 'music')    response = await handleMusicCommand(userText, volume, setVolume)
      } catch {}
      if (response) {
        addDisplayMessage({ role: 'user', content: userText })
        addDisplayMessage({ role: 'assistant', content: response, isIntent: true })
        speak(response, { newsRate: intent === 'news' })
        return
      }
    }

    // 2. Response cache
    const cached = getCached(userText)
    if (cached) {
      setCacheHits(n => n + 1)
      addDisplayMessage({ role: 'user', content: userText })
      addDisplayMessage({ role: 'assistant', content: cached, isCached: true })
      speak(cached)
      return
    }

    // 3. Claude API
    addMessage({ role: 'user', content: userText })
    try {
      let history = apiHistoryRef.current.slice(-HISTORY_LIMIT)
      while (history.length && history[0].role !== 'user') history = history.slice(1)
      const maxTokens = getMaxTokens(userText)
      let apiMsgs = history.map(m => ({ role: m.role, content: m.content }))
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
          const toolUseBlocks = data.content.filter(b => b.type === 'tool_use')
          setActiveTools(toolUseBlocks.map(b => b.name))
          apiMsgs = [...apiMsgs, { role: 'assistant', content: data.content }]
          const toolResults = await Promise.all(
            toolUseBlocks.map(async block => ({
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
        finalText = data.content.find(b => b.type === 'text')?.text ?? '[No response]'
        break
      }

      setApiCallCount(n => n + 1)
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
  }, [addMessage, addDisplayMessage, speak, updateStatus, updateWakeMode, volume])

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Speech recognition not supported. Use Chrome or Edge.'); return }
    if (passiveRef.current) { passiveRef.current.abort(); passiveRef.current = null }
    if (recognitionRef.current) recognitionRef.current.abort()

    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'
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
    setTimeout(() => startPassiveRef.current?.(), 300)
  }, [updateStatus])

  const stopPassiveListening = useCallback(() => {
    if (passiveRef.current) { passiveRef.current.abort(); passiveRef.current = null }
    updateWakeMode('off')
  }, [updateWakeMode])

  const startPassiveListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    if (['listening', 'loading', 'speaking'].includes(statusRef.current)) return
    if (passiveRef.current) { passiveRef.current.abort(); passiveRef.current = null }

    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (/hey[\s,]*eva/.test(e.results[i][0].transcript.toLowerCase())) {
          rec.abort()
          passiveRef.current = null
          updateWakeMode('awake')
          setTimeout(() => startListeningRef.current?.(), 250)
          return
        }
      }
    }

    rec.onend = () => {
      if (passiveRef.current === rec && wakeModeRef.current === 'passive') {
        setTimeout(() => { if (wakeModeRef.current === 'passive') startPassiveRef.current?.() }, 300)
      }
    }

    rec.onerror = (e) => {
      if (e.error !== 'aborted' && passiveRef.current === rec) {
        passiveRef.current = null
        setTimeout(() => { if (wakeModeRef.current === 'passive') startPassiveRef.current?.() }, 2000)
      }
    }

    passiveRef.current = rec
    updateWakeMode('passive')
    try {
      rec.start()
    } catch {
      passiveRef.current = null
      updateWakeMode('off')
    }
  }, [updateWakeMode])

  startListeningRef.current = startListening
  startPassiveRef.current = startPassiveListening

  const initSpotify = useCallback(async () => {
    try {
      await initPlayer(setPlayerState)
      setSpotifyAuth(true)
    } catch (err) {
      console.error('[EVA Spotify]', err)
    }
  }, [])

  const handleNowPlayingControl = useCallback(async (action) => {
    if (action === 'toggle') await togglePlay()
    else if (action === 'next') await nextTrack()
    else if (action === 'previous') await previousTrack()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    if (code && state) {
      handleCallback(code, state).then(success => {
        window.history.replaceState({}, '', '/')
        if (success) initSpotify()
      })
    } else if (isAuthenticated()) {
      initSpotify()
    }

    navigator.permissions?.query({ name: 'microphone' })
      .then(result => {
        if (result.state === 'granted') startPassiveRef.current?.()
        result.onchange = () => {
          if (result.state === 'granted' && wakeModeRef.current === 'off') startPassiveRef.current?.()
        }
      })
      .catch(() => {})

    return () => {
      if (passiveRef.current) { passiveRef.current.abort(); passiveRef.current = null }
    }
  }, [])

  const handleMicClick = useCallback(() => {
    if (status === 'listening') { stopListening(); startPassiveListening() }
    else if (status === 'speaking') { stopAudio(); updateStatus('idle'); startPassiveListening() }
    else if (status === 'loading') { /* do nothing */ }
    else { stopPassiveListening(); startListening() }
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

  return (
    <div className="app">
      {/* Scan beam */}
      <div className="scanline" />

      {/* Header */}
      <header className="header">
        <div className="header-left">
          <span className="mode-badge">PERSONAL</span>
        </div>

        <div className="header-center">
          <span className="logo-diamond">◈</span>
          <span className="logo-text">E.V.A</span>
          <span className="logo-sub">— ETHAN'S VIRTUAL ASSISTANT</span>
        </div>

        <div className="header-right">
          {!spotifyAuth && (
            <button className="spotify-connect-btn" onClick={initiateLogin}>
              <SpotifyIcon /> CONNECT SPOTIFY
            </button>
          )}
          <div className="header-status">
            <span className={`status-dot status-dot-${status}`} />
            <span style={{ fontSize: 9, letterSpacing: '2px', color: 'var(--text3)' }}>
              {status.toUpperCase()}
            </span>
          </div>
        </div>
      </header>

      {/* Dashboard */}
      <main className="main">
        <div className="widget-grid">
          {/* Left column */}
          <div className="widget-col">
            <ClockWidget />
            <NowPlaying playerState={playerState} onControl={handleNowPlayingControl} />
          </div>

          {/* Center: Orb */}
          <div className="orb-area">
            <EvaOrb3D status={status} onClick={handleMicClick} />

            <div className={`wake-indicator wake-indicator-${wakeMode}`}>
              <span className="wake-dot" />
              <span className="wake-label">
                {wakeMode === 'passive' ? 'PASSIVE · say "Hey EVA"'
                  : wakeMode === 'awake' ? 'AWAKE'
                  : 'click orb to speak'}
              </span>
            </div>

            {activeTools.length > 0 && (
              <div className="active-tools">
                ◈ {activeTools.map(t => t.replace(/_/g, ' ').toUpperCase()).join(', ')}
              </div>
            )}

            {interimText && (
              <div className="interim-wrap">
                <div className="interim">
                  <span className="interim-caret">›</span> {interimText}
                </div>
              </div>
            )}

            {speechError && (
              <div className="speech-error">MIC ERROR: {speechError.replace(/-/g, ' ').toUpperCase()}</div>
            )}

            <div className="text-input-row">
              <input
                className="text-input"
                type="text"
                placeholder="type a message..."
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
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
          </div>

          {/* Right column */}
          <div className="widget-col">
            <WeatherWidget />
            <MarketWidget />
          </div>
        </div>

        {/* Conversation log */}
        <ConversationLog conversation={conversation} />
      </main>

      {/* Status bar */}
      <StatusBar apiCallCount={apiCallCount} cacheHits={cacheHits} />
    </div>
  )
}

function SpotifyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  )
}
