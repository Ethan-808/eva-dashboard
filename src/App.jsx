import React, { useState, useRef, useCallback, useEffect } from 'react'
import EvaOrb3D from './components/EvaOrb3D'
import StarField from './components/StarField'
import WeatherWidget from './components/WeatherWidget'
import NowPlaying from './components/NowPlaying'
import ConversationLog from './components/ConversationLog'
import FinanceWidget from './components/FinanceWidget'
import {
  classifyIntent, getMaxTokens, getTopHeadline,
  handleTime, handleWeather, handleNews, handleCalendar, handleMath, handleGreeting, handleStocks,
} from './intent.js'
import { getCached, setCached } from './cache.js'
import { initiateLogin, handleCallback, isAuthenticated } from './spotify/auth.js'
import { initiateCalendarAuth, handleCalendarCallback, isCalendarConnected } from './calendar/auth.js'
import { fetchTodayEvents, formatEventTime } from './calendar/api.js'
import { initPlayer, togglePlay, nextTrack, previousTrack } from './spotify/player.js'
import { handleMusicCommand } from './spotify/commands.js'
import { getData, getNetWorth, getMonthlyBurn, getMonthlyIncome, saveData, snapshotNetWorth } from './finance/data.js'

const SYSTEM_PROMPT =
  `You are EVA — Ethan's personal AI assistant. Think JARVIS meets a brilliant friend who happens to know everything. Sharp, witty, direct. You actually know Ethan: Stanford freshman, entrepreneur, interning at the Hawaii state senate, doing Blue Startups accelerator, running The Yang Thesis YouTube channel, building his personal brand. Reference his world naturally when it's relevant — not forced.

Voice rules (you are speaking out loud, not writing):
- Under 2 sentences unless Ethan explicitly asks for more
- Never read full lists — summarize ("three things stand out" then pick the best one)
- Weather: one sentence, e.g. "77 and clear in Honolulu right now"
- News: lead story only, offer more — e.g. "Top story: X. Want the rest?"
- Stocks: one line — e.g. "Markets are up, SPY plus 0.8%"

Personality rules:
- Vary your openers — NEVER start with "Sure!", "Of course!", "Certainly!", "Great question!", "Absolutely!", or "I'd be happy to"
- Good openers: lead with the answer, "Already on it —", "Quick answer:", "Yep —", "So —", "Here's the thing:", "Good timing —", "Straight up —", or just no opener at all
- Dry humor when appropriate, but don't force it
- Sound like someone who genuinely knows Ethan, not a customer service bot
- Vary your sentence structure and vocabulary — never sound robotic or repetitive

Use tools proactively when they help answer accurately.`

const MODES = ['personal', 'senate', 'startup', 'content']

const MODEL = 'claude-sonnet-4-6'
const API_URL = '/api/claude/v1/messages'
const ELEVENLABS_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'
const HISTORY_LIMIT = 4
// Sentence boundary: punctuation followed by whitespace or end of string
const SENTENCE_RE = /[.!?]+(?:\s+|$)/

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
      properties: { location: { type: 'string', description: 'City or location name' } },
      required: ['location'],
    },
  },
  {
    name: 'save_note',
    description: 'Save a note or reminder.',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string' }, content: { type: 'string' } },
      required: ['title', 'content'],
    },
  },
  {
    name: 'get_notes',
    description: 'Retrieve all saved notes.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'delete_note',
    description: 'Delete a note by index.',
    input_schema: {
      type: 'object',
      properties: { index: { type: 'number' } },
      required: ['index'],
    },
  },
  {
    name: 'get_finance_summary',
    description: "Get Ethan's current financial summary: net worth, assets, liabilities, monthly burn, income.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'update_asset',
    description: 'Update the value of one of the asset accounts.',
    input_schema: {
      type: 'object',
      properties: {
        key:    { type: 'string', description: 'One of: checking, savings, investments, crypto, other' },
        amount: { type: 'number', description: 'New balance in USD' },
      },
      required: ['key', 'amount'],
    },
  },
  {
    name: 'update_liability',
    description: 'Update the value of one of the liability accounts.',
    input_schema: {
      type: 'object',
      properties: {
        key:    { type: 'string', description: 'One of: creditCard, loans, other' },
        amount: { type: 'number', description: 'New balance in USD' },
      },
      required: ['key', 'amount'],
    },
  },
  {
    name: 'log_income',
    description: 'Log an income payment received this month.',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source or description of income' },
        amount: { type: 'number', description: 'New balance in USD' },
      },
      required: ['source', 'amount'],
    },
  },
]

function cleanForTTS(text) {
  return text
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/\*\*|[*#`~]/g, '')
    .replace(/[—–]/g, ', ')
    .replace(/,\s*,+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function fmtNW(n) {
  const abs = Math.abs(n)
  if (abs >= 1000000) return `$${(n / 1000000).toFixed(2)}M`
  if (abs >= 1000)    return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

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
    case 'get_finance_summary': {
      const d = getData()
      const nw    = getNetWorth(d)
      const burn  = getMonthlyBurn(d)
      const inc   = getMonthlyIncome(d)
      const assets = Object.values(d.assets).reduce((a, b) => a + b, 0)
      const liabs  = Object.values(d.liabilities).reduce((a, b) => a + b, 0)
      const subs   = d.subscriptions.map(s => `${s.name} $${s.amount}/${s.billingCycle}`).join(', ')
      return [
        `Net worth: $${nw.toFixed(2)}`,
        `Total assets: $${assets.toFixed(2)}`,
        `Total liabilities: $${liabs.toFixed(2)}`,
        `Monthly burn (subscriptions): $${burn.toFixed(2)}`,
        `Income this month: $${inc.toFixed(2)}`,
        `Subscriptions: ${subs}`,
      ].join('\n')
    }
    case 'update_asset': {
      const d = getData()
      const validKeys = Object.keys(d.assets)
      if (!validKeys.includes(input.key)) return `Unknown asset key "${input.key}". Valid: ${validKeys.join(', ')}`
      d.assets[input.key] = input.amount
      saveData(d)
      snapshotNetWorth()
      return `Updated ${input.key} to $${input.amount}. New net worth: $${getNetWorth(d).toFixed(2)}`
    }
    case 'update_liability': {
      const d = getData()
      const validKeys = Object.keys(d.liabilities)
      if (!validKeys.includes(input.key)) return `Unknown liability key "${input.key}". Valid: ${validKeys.join(', ')}`
      d.liabilities[input.key] = input.amount
      saveData(d)
      snapshotNetWorth()
      return `Updated ${input.key} to $${input.amount}. New net worth: $${getNetWorth(d).toFixed(2)}`
    }
    case 'log_income': {
      const d = getData()
      d.income.push({ source: input.source, amount: input.amount, date: new Date().toISOString().slice(0, 10) })
      saveData(d)
      return `Logged $${input.amount} from ${input.source}. Total this month: $${getMonthlyIncome(d).toFixed(2)}`
    }
    default: return `Unknown tool: ${name}`
  }
}

export default function App() {
  const [bootPhase, setBootPhase] = useState(0)
  const [status, setStatus] = useState('idle')
  const [wakeMode, setWakeMode] = useState('off')
  const [conversation, setConversation] = useState([])
  const [interimText, setInterimText] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [activeTools, setActiveTools] = useState([])
  const [textInput, setTextInput] = useState('')
  const [speechError, setSpeechError] = useState('')
  const [apiCallCount, setApiCallCount] = useState(0)
  const [cacheHits, setCacheHits] = useState(0)
  const [spotifyAuth, setSpotifyAuth] = useState(isAuthenticated())
  const [playerState, setPlayerState] = useState(null)
  const [volume, setVolume] = useState(50)
  const [mode, setMode] = useState('personal')
  const [calendarConnected, setCalendarConnected] = useState(isCalendarConnected)
  const [nextEvent, setNextEvent] = useState(null)

  // Panel visibility
  const [showConvo,   setShowConvo]   = useState(false)
  const [showWeather, setShowWeather] = useState(false)
  const [showFinance, setShowFinance] = useState(false)
  const convoTimerRef   = useRef(null)
  const weatherTimerRef = useRef(null)

  const statusRef = useRef('idle')
  const wakeModeRef = useRef('off')
  const conversationRef = useRef([])
  const apiHistoryRef = useRef([])
  const recognitionRef = useRef(null)
  const passiveRef = useRef(null)
  const audioRef = useRef(null)
  const startListeningRef = useRef(null)
  const startPassiveRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const activeSilenceTimerRef = useRef(null)
  const startActiveSilenceTimerRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingAudioRef = useRef(false)
  const spokenBoundaryRef = useRef(0)

  const cycleMode = useCallback(() => {
    setMode(m => MODES[(MODES.indexOf(m) + 1) % MODES.length])
  }, [])

  const updateStatus = useCallback((s) => { statusRef.current = s; setStatus(s) }, [])
  const updateWakeMode = useCallback((m) => { wakeModeRef.current = m; setWakeMode(m) }, [])

  const clearActiveSilenceTimer = useCallback(() => {
    clearTimeout(activeSilenceTimerRef.current)
    activeSilenceTimerRef.current = null
  }, [])

  const startActiveSilenceTimer = useCallback(() => {
    clearTimeout(activeSilenceTimerRef.current)
    activeSilenceTimerRef.current = setTimeout(() => {
      updateWakeMode('passive')
      startPassiveRef.current?.()
    }, 60000)
  }, [updateWakeMode])

  const showConvoPanel = useCallback(() => {
    setShowConvo(true)
    clearTimeout(convoTimerRef.current)
    convoTimerRef.current = setTimeout(() => setShowConvo(false), 30000)
  }, [])

  const addMessage = useCallback((msg) => {
    const entry = { ...msg, timestamp: new Date() }
    conversationRef.current = [...conversationRef.current, entry]
    setConversation([...conversationRef.current])
    apiHistoryRef.current = [...apiHistoryRef.current, { role: msg.role, content: msg.content }]
    if (msg.role === 'assistant') showConvoPanel()
    return entry
  }, [showConvoPanel])

  const addDisplayMessage = useCallback((msg) => {
    const entry = { ...msg, timestamp: new Date() }
    conversationRef.current = [...conversationRef.current, entry]
    setConversation([...conversationRef.current])
    if (msg.role === 'assistant') showConvoPanel()
  }, [showConvoPanel])

  // --- Audio queue ---

  const playNextAudio = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingAudioRef.current = false
      if (statusRef.current === 'speaking') {
        updateStatus('idle')
        if (wakeModeRef.current === 'active') {
          startActiveSilenceTimerRef.current?.()
          startListeningRef.current?.()
        } else {
          startPassiveRef.current?.()
        }
      }
      return
    }
    isPlayingAudioRef.current = true
    const item = audioQueueRef.current.shift()

    if (item.isBrowserTTS) {
      const synth = window.speechSynthesis
      const utter = new SpeechSynthesisUtterance(item.text)
      utter.rate = 0.95
      utter.pitch = 0.88
      const applyVoice = () => {
        const voices = synth.getVoices()
        const pick = voices.find(v => v.name.includes('Google') && v.lang === 'en-US') || voices.find(v => v.lang === 'en-US')
        if (pick) utter.voice = pick
      }
      if (synth.getVoices().length > 0) applyVoice()
      else synth.onvoiceschanged = applyVoice
      utter.onend = () => { audioRef.current = null; playNextAudio() }
      utter.onerror = () => { audioRef.current = null; playNextAudio() }
      synth.speak(utter)
      return
    }

    const audio = new Audio(item.url)
    audioRef.current = audio
    audio.onended = () => { URL.revokeObjectURL(item.url); audioRef.current = null; playNextAudio() }
    audio.onerror = () => { URL.revokeObjectURL(item.url); audioRef.current = null; playNextAudio() }
    audio.play().catch(() => playNextAudio())
  }, [updateStatus])

  const stopAudio = useCallback(() => {
    audioQueueRef.current.forEach(item => item.url && URL.revokeObjectURL(item.url))
    audioQueueRef.current = []
    isPlayingAudioRef.current = false
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    window.speechSynthesis.cancel()
  }, [])

  // Fetch ElevenLabs audio and push to queue; start playing if idle
  const queueSpeakChunk = useCallback(async (text, { newsRate = false } = {}) => {
    const cleaned = cleanForTTS(text)
    if (!cleaned) return
    updateStatus('speaking')
    const elevenKey = import.meta.env.VITE_ELEVENLABS_API_KEY
    if (elevenKey) {
      try {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
          {
            method: 'POST',
            headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: cleaned,
              model_id: 'eleven_monolingual_v1',
              voice_settings: { stability: 0.6, similarity_boost: 0.75, style: 0.3 },
            }),
          }
        )
        if (!res.ok) throw new Error(`ElevenLabs ${res.status}`)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        audioQueueRef.current.push({ url })
        if (!isPlayingAudioRef.current) playNextAudio()
        return
      } catch (err) {
        console.error('[EVA TTS]', err)
      }
    }
    // Browser TTS fallback
    audioQueueRef.current.push({ isBrowserTTS: true, text: cleaned, newsRate })
    if (!isPlayingAudioRef.current) playNextAudio()
  }, [playNextAudio, updateStatus])

  // Single-shot speak: clears queue, speaks text (used for intent/cache responses)
  const speak = useCallback((text, { newsRate = false } = {}) => {
    stopAudio()
    spokenBoundaryRef.current = 0
    queueSpeakChunk(text, { newsRate })
  }, [stopAudio, queueSpeakChunk])

  // Speak next complete sentence(s) from accumulated text; if isComplete, flush remainder
  const trySpeakNext = useCallback((fullText, isComplete = false) => {
    const unspoken = fullText.slice(spokenBoundaryRef.current)
    if (isComplete) {
      const remaining = unspoken.trim()
      if (remaining) {
        spokenBoundaryRef.current = fullText.length
        queueSpeakChunk(remaining)
      }
      return
    }
    const match = SENTENCE_RE.exec(unspoken)
    if (match) {
      const end = match.index + match[0].length
      const sentence = unspoken.slice(0, end).trim()
      spokenBoundaryRef.current += end
      if (sentence) queueSpeakChunk(sentence)
      // Recurse to catch multiple completed sentences in one delta
      trySpeakNext(fullText)
    }
  }, [queueSpeakChunk])

  // Wake-word chime: two-tone rising ping
  const playChime = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.08)
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.25)
    } catch {}
  }, [])

  const runMorningBriefing = useCallback(async () => {
    const waitForSpeech = () => new Promise(resolve => {
      const poll = () => statusRef.current !== 'speaking' ? resolve() : setTimeout(poll, 150)
      setTimeout(poll, 50)
    })

    // 1. Time greeting
    const now = new Date()
    const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'Pacific/Honolulu', hour: 'numeric', minute: '2-digit', hour12: true })
    const dayStr = now.toLocaleDateString('en-US', { timeZone: 'Pacific/Honolulu', weekday: 'long', month: 'long', day: 'numeric' })
    const greeting = `Good morning Ethan, it's ${timeStr} on ${dayStr}.`
    addDisplayMessage({ role: 'assistant', content: greeting, isIntent: true })
    speak(greeting)
    await waitForSpeech()

    // 2. Weather
    let weatherLine = "Weather data unavailable right now."
    try {
      const wt = await handleWeather('weather in Honolulu')
      if (wt) weatherLine = wt
    } catch {}
    addDisplayMessage({ role: 'assistant', content: weatherLine, isIntent: true })
    speak(weatherLine)
    await waitForSpeech()

    // 3. Top headline
    let newsLine = "No top headlines available right now."
    try {
      const headline = await getTopHeadline()
      if (headline) newsLine = `Top story: ${headline}.`
    } catch {}
    addDisplayMessage({ role: 'assistant', content: newsLine, isIntent: true })
    speak(newsLine)
    await waitForSpeech()

    // 4. Markets: SPY + BTC
    let marketsLine = "Market data unavailable right now."
    try {
      const apiKey = import.meta.env.VITE_FINNHUB_API_KEY
      if (apiKey) {
        const [spyRes, btcRes] = await Promise.all([
          fetch(`/api/finnhub/api/v1/quote?symbol=SPY&token=${apiKey}`),
          fetch(`/api/finnhub/api/v1/quote?symbol=BINANCE:BTCUSDT&token=${apiKey}`),
        ])
        const spy = spyRes.ok ? await spyRes.json() : null
        const btc = btcRes.ok ? await btcRes.json() : null
        const parts = []
        if (spy?.c) {
          const dir = (spy.dp ?? 0) >= 0 ? 'up' : 'down'
          parts.push(`SPY ${dir} ${Math.abs(spy.dp ?? 0).toFixed(1)}% at $${spy.c.toFixed(0)}`)
        }
        if (btc?.c) {
          const dir = (btc.dp ?? 0) >= 0 ? 'up' : 'down'
          const price = btc.c.toLocaleString('en-US', { maximumFractionDigits: 0 })
          parts.push(`Bitcoin ${dir} ${Math.abs(btc.dp ?? 0).toFixed(1)}% at $${price}`)
        }
        if (parts.length) marketsLine = `${parts.join(', ')}.`
      }
    } catch {}
    addDisplayMessage({ role: 'assistant', content: marketsLine, isIntent: true })
    speak(marketsLine)
    await waitForSpeech()

    // 5. Motivational line — single Claude call, max 50 tokens
    let motivLine = "Make today count."
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 50,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: "Give Ethan one short motivational line to start his morning. Be direct and specific to his world. No quotes, no attribution. Under 15 words." }],
          stream: false,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const text = data.content?.[0]?.text?.trim()
        if (text) motivLine = text
      }
    } catch {}
    addDisplayMessage({ role: 'assistant', content: motivLine, isIntent: true })
    speak(motivLine)
  }, [speak, addDisplayMessage])

  const sendToEva = useCallback(async (userText) => {
    // Close finance panel
    if (/\b(close|hide|dismiss|collapse).*(finance|panel|chart)\b/i.test(userText)) {
      setShowFinance(false)
      addDisplayMessage({ role: 'user', content: userText })
      addDisplayMessage({ role: 'assistant', content: 'Finance panel closed.', isIntent: true })
      speak('Done.')
      return
    }

    // Sleep / deactivate command
    if (wakeModeRef.current === 'active' && /\b(go to sleep|goodbye eva|sleep mode|bye eva|stop listening)\b/i.test(userText)) {
      addDisplayMessage({ role: 'user', content: userText })
      addDisplayMessage({ role: 'assistant', content: 'Going to sleep. Say "Hey EVA" to wake me.' })
      clearActiveSilenceTimer()
      updateWakeMode('passive')
      speak('Going to sleep.')
      setTimeout(() => startPassiveRef.current?.(), 1200)
      return
    }

    // Morning briefing
    if (/\b(good\s+morning|morning\s+briefing)\b/i.test(userText)) {
      addDisplayMessage({ role: 'user', content: userText })
      runMorningBriefing()
      return
    }

    // Finance visual trigger — open chart panel + speak one-line summary
    const isFinanceShow =
      /\b(show|open|pull\s+up|display|bring\s+up).*(net\s+worth|finances?|wealth|balance\s+sheet)/i.test(userText)
      || /\bnet\s+worth\b.*(chart|graph|show|visual|trend|history)/i.test(userText)
      || /\bshow.*(my\s+)?finances?\b/i.test(userText)
      || /\bfinance\s+(chart|graph|panel|dashboard|visual)\b/i.test(userText)
    if (isFinanceShow) {
      setShowFinance(true)
      window.dispatchEvent(new CustomEvent('eva-finance-expand'))
      const d = getData()
      const nw = getNetWorth(d)
      const hist = d.netWorthHistory
      let summary
      if (hist.length >= 2) {
        const anchor = hist[Math.max(0, hist.length - 31)]
        const delta  = nw - anchor.amount
        const sign   = delta >= 0 ? '+' : '-'
        const dFmt   = Math.abs(delta) >= 1000
          ? `${sign}$${(Math.abs(delta) / 1000).toFixed(1)}k`
          : `${sign}$${Math.abs(delta).toFixed(0)}`
        summary = `Your net worth is ${fmtNW(nw)}, ${dFmt} this month.`
      } else {
        summary = `Your net worth is ${fmtNW(nw)}.`
      }
      addDisplayMessage({ role: 'user', content: userText })
      addDisplayMessage({ role: 'assistant', content: summary, isIntent: true })
      speak(summary)
      return
    }

    updateStatus('loading')
    setInterimText('')
    setStreamingText('')
    setActiveTools([])
    clearActiveSilenceTimer()
    if (wakeModeRef.current !== 'active') updateWakeMode('off')
    spokenBoundaryRef.current = 0

    // 1. Intent detection
    const intent = classifyIntent(userText)
    if (intent) {
      let response
      try {
        if (intent === 'time')         response = await handleTime()
        else if (intent === 'weather') response = await handleWeather(userText)
        else if (intent === 'news')    response = await handleNews()
        else if (intent === 'calendar') response = await handleCalendar()
        else if (intent === 'math')    response = handleMath(userText) || null
        else if (intent === 'stocks')  response = await handleStocks(userText)
        else if (intent === 'greeting') response = handleGreeting()
        else if (intent === 'music')   response = await handleMusicCommand(userText, volume, setVolume)
      } catch {}
      if (response) {
        addDisplayMessage({ role: 'user', content: userText })
        addDisplayMessage({ role: 'assistant', content: response, isIntent: true })
        speak(response, { newsRate: intent === 'news' })
        if (intent === 'weather') {
          setShowWeather(true)
          clearTimeout(weatherTimerRef.current)
          weatherTimerRef.current = setTimeout(() => setShowWeather(false), 10000)
        }
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

    // 3. Claude API — streaming
    addMessage({ role: 'user', content: userText })
    try {
      let history = apiHistoryRef.current.slice(-HISTORY_LIMIT)
      while (history.length && history[0].role !== 'user') history = history.slice(1)
      const maxTokens = getMaxTokens(userText)
      let apiMsgs = history.map(m => ({ role: m.role, content: m.content }))

      while (true) {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: MODEL, max_tokens: maxTokens, system: SYSTEM_PROMPT,
            tools: TOOLS, messages: apiMsgs, stream: true,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error?.message || `HTTP ${res.status}`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        let accText = ''
        let stopReason = null
        let currentTool = null
        let assistantContent = []

        outer: while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop()

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue
            let ev
            try { ev = JSON.parse(raw) } catch { continue }

            switch (ev.type) {
              case 'content_block_start':
                if (ev.content_block.type === 'text') {
                  assistantContent.push({ type: 'text', text: '' })
                } else if (ev.content_block.type === 'tool_use') {
                  currentTool = {
                    type: 'tool_use',
                    id: ev.content_block.id,
                    name: ev.content_block.name,
                    _raw: '',
                  }
                  assistantContent.push(currentTool)
                  setActiveTools(prev => [...new Set([...prev, ev.content_block.name])])
                }
                break
              case 'content_block_delta':
                if (ev.delta.type === 'text_delta') {
                  accText += ev.delta.text
                  // Update the last text block in assistantContent
                  for (let i = assistantContent.length - 1; i >= 0; i--) {
                    if (assistantContent[i].type === 'text') {
                      assistantContent[i].text += ev.delta.text
                      break
                    }
                  }
                  setStreamingText(accText)
                  trySpeakNext(accText)
                } else if (ev.delta.type === 'input_json_delta' && currentTool) {
                  currentTool._raw += ev.delta.partial_json
                }
                break
              case 'content_block_stop':
                if (currentTool) {
                  try { currentTool.input = JSON.parse(currentTool._raw || '{}') } catch { currentTool.input = {} }
                  delete currentTool._raw
                  currentTool = null
                }
                break
              case 'message_delta':
                stopReason = ev.delta.stop_reason
                break
            }
          }
        }

        if (stopReason === 'tool_use') {
          const toolBlocks = assistantContent.filter(b => b.type === 'tool_use')
          apiMsgs = [...apiMsgs, { role: 'assistant', content: assistantContent }]
          const toolResults = await Promise.all(
            toolBlocks.map(async block => ({
              type: 'tool_result',
              tool_use_id: block.id,
              content: await executeTool(block.name, block.input),
            }))
          )
          apiMsgs = [...apiMsgs, { role: 'user', content: toolResults }]
          apiHistoryRef.current = [
            ...apiHistoryRef.current,
            { role: 'assistant', content: assistantContent },
            { role: 'user', content: toolResults },
          ]
          setActiveTools([])
          setStreamingText('')
          accText = ''
          spokenBoundaryRef.current = 0
          continue
        }

        // Final text response
        const finalText = accText.trim() || '[No response]'
        setStreamingText('')
        setApiCallCount(n => n + 1)
        setCached(userText, finalText)
        addMessage({ role: 'assistant', content: finalText })
        trySpeakNext(finalText, true)
        break
      }
    } catch (err) {
      console.error('[EVA]', err)
      setActiveTools([])
      setStreamingText('')
      addMessage({ role: 'assistant', content: `[ERROR] ${err.message}`, isError: true })
      updateStatus('idle')
      if (wakeModeRef.current === 'active') {
        startActiveSilenceTimerRef.current?.()
        startListeningRef.current?.()
      } else {
        startPassiveRef.current?.()
      }
    }
  }, [addMessage, addDisplayMessage, speak, trySpeakNext, updateStatus, updateWakeMode, clearActiveSilenceTimer, volume, runMorningBriefing])

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
      clearTimeout(silenceTimerRef.current)
      let interim = '', final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      setInterimText(interim || final)
      if (final.trim()) {
        recognitionRef.current = null
        sendToEva(final.trim())
      } else if (interim.trim()) {
        // Stop after 1.5s of silence following speech
        silenceTimerRef.current = setTimeout(() => {
          recognitionRef.current?.stop()
        }, 1500)
      }
    }

    rec.onerror = (e) => {
      clearTimeout(silenceTimerRef.current)
      if (e.error !== 'aborted') {
        updateStatus('idle')
        setInterimText('')
        setSpeechError(e.error)
        setTimeout(() => setSpeechError(''), 4000)
        if (wakeModeRef.current === 'active') startListeningRef.current?.()
        else startPassiveRef.current?.()
      }
    }

    rec.onend = () => {
      clearTimeout(silenceTimerRef.current)
      if (statusRef.current === 'listening') {
        updateStatus('idle')
        setInterimText('')
        if (wakeModeRef.current === 'active') startListeningRef.current?.()
        else startPassiveRef.current?.()
      }
    }

    recognitionRef.current = rec
    rec.start()
  }, [sendToEva, updateStatus])

  const stopListening = useCallback(() => {
    clearTimeout(silenceTimerRef.current)
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null }
    updateStatus('idle')
    setInterimText('')
    setTimeout(() => {
      if (wakeModeRef.current === 'active') startListeningRef.current?.()
      else startPassiveRef.current?.()
    }, 300)
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
        if (/hey[\s,]*eva/i.test(e.results[i][0].transcript)) {
          rec.abort()
          passiveRef.current = null
          updateWakeMode('active')
          playChime()
          startActiveSilenceTimerRef.current?.()
          startListeningRef.current?.()
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
  }, [updateWakeMode, playChime])

  startListeningRef.current = startListening
  startPassiveRef.current = startPassiveListening
  startActiveSilenceTimerRef.current = startActiveSilenceTimer

  // Spacebar hold-to-talk (only after boot completes)
  useEffect(() => {
    if (bootPhase < 4) return
    let spaceHeld = false
    const onKeyDown = (e) => {
      if (e.code !== 'Space' || e.repeat || spaceHeld) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      spaceHeld = true
      e.preventDefault()
      if (statusRef.current === 'idle' || statusRef.current === 'speaking') {
        stopAudio()
        if (passiveRef.current) { passiveRef.current.abort(); passiveRef.current = null }
        startListeningRef.current?.()
      }
    }
    const onKeyUp = (e) => {
      if (e.code !== 'Space' || !spaceHeld) return
      spaceHeld = false
      if (statusRef.current === 'listening') {
        recognitionRef.current?.stop()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [bootPhase, stopAudio])

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

  // Boot sequence
  useEffect(() => {
    const t1 = setTimeout(() => setBootPhase(1), 200)
    const t2 = setTimeout(() => setBootPhase(2), 2400)
    const t3 = setTimeout(() => setBootPhase(3), 3700)
    const t4 = setTimeout(() => setBootPhase(4), 4600)
    return () => { [t1, t2, t3, t4].forEach(clearTimeout) }
  }, [])

  // Spotify auth callback (runs on mount, independent of boot)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code   = params.get('code')
    const state  = params.get('state')
    if (code && state) {
      handleCallback(code, state).then(success => {
        window.history.replaceState({}, '', '/')
        if (success) initSpotify()
      })
    } else if (isAuthenticated()) {
      initSpotify()
    }
  }, [])

  // Google Calendar OAuth callback (implicit flow via hash)
  useEffect(() => {
    if (handleCalendarCallback()) {
      setCalendarConnected(true)
    }
  }, [])

  // Poll calendar events every 5 min when connected
  useEffect(() => {
    if (!calendarConnected) return
    async function loadEvents() {
      const events = await fetchTodayEvents()
      const now = new Date()
      const upcoming = events.find(e => !e.allDay && new Date(e.start) > now)
        || events.find(e => e.allDay)
      setNextEvent(upcoming || null)
    }
    loadEvents()
    const id = setInterval(loadEvents, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [calendarConnected])

  // Start passive listening after boot completes
  useEffect(() => {
    if (bootPhase !== 4) return
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
  }, [bootPhase])

  // Finance panel expand listener
  useEffect(() => {
    const handler = () => setShowFinance(true)
    window.addEventListener('eva-finance-expand', handler)
    return () => window.removeEventListener('eva-finance-expand', handler)
  }, [])

  const handleMicClick = useCallback(() => {
    if (status === 'listening') {
      clearActiveSilenceTimer()
      stopListening()
      if (wakeMode === 'active') updateWakeMode('passive')
    } else if (status === 'speaking') {
      clearActiveSilenceTimer()
      stopAudio()
      updateStatus('idle')
      updateWakeMode('passive')
      startPassiveListening()
    } else if (status === 'loading') {
      // do nothing while processing
    } else if (wakeMode === 'active') {
      clearActiveSilenceTimer()
      updateWakeMode('passive')
      startPassiveListening()
    } else {
      stopPassiveListening()
      startListening()
    }
  }, [status, wakeMode, startListening, stopListening, startPassiveListening, stopPassiveListening, stopAudio, updateStatus, updateWakeMode, clearActiveSilenceTimer])

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

  const serviceStatus = [
    { id: 'claude',  on: !!import.meta.env.VITE_CLAUDE_API_KEY },
    { id: 'tts',     on: !!import.meta.env.VITE_ELEVENLABS_API_KEY },
    { id: 'weather', on: !!import.meta.env.VITE_OPENWEATHER_API_KEY },
    { id: 'news',    on: !!import.meta.env.VITE_NEWS_API_KEY },
    { id: 'stocks',  on: !!import.meta.env.VITE_FINNHUB_API_KEY },
  ]

  return (
    <div className="app-shell">
      <StarField />

      {/* ── Orb stage: centered, always visible ── */}
      <div className="orb-stage">
        <div className={`orb-container ${bootPhase >= 1 ? 'orb-emerged' : ''}`}>
          <EvaOrb3D status={status} bootPhase={bootPhase} onClick={handleMicClick} />
        </div>

        <div className={`orb-label-wrap ${bootPhase >= 2 ? 'visible' : ''}`}>
          <div className="orb-name">
            {'E.V.A'.split('').map((ch, i) => (
              <span key={i} className="orb-name-letter" style={{ animationDelay: `${i * 0.1}s` }}>{ch}</span>
            ))}
          </div>
          <div className={`orb-subtitle ${bootPhase >= 3 ? 'visible' : ''}`}>
            ETHAN'S VIRTUAL ASSISTANT
          </div>
        </div>

        {bootPhase >= 4 && (
          <>
            <div className={`wake-indicator wake-indicator-${wakeMode}`} style={{ marginTop: 18 }}>
              <span className="wake-dot" />
              <span className="wake-label">
                {wakeMode === 'active'   ? 'ACTIVE · listening'
                  : wakeMode === 'passive' ? 'PASSIVE · say "Hey EVA"'
                  : wakeMode === 'awake'   ? 'AWAKE'
                  : 'click orb · hold space'}
              </span>
            </div>

            {activeTools.length > 0 && (
              <div className="active-tools" style={{ marginTop: 10 }}>
                ◈ {activeTools.map(t => t.replace(/_/g, ' ').toUpperCase()).join(', ')}
              </div>
            )}

            {(interimText || streamingText) && (
              <div className="orb-response-text">
                <span className="interim-caret">›</span> {interimText || streamingText}
              </div>
            )}

            {speechError && (
              <div className="speech-error">MIC ERROR: {speechError.replace(/-/g, ' ').toUpperCase()}</div>
            )}
          </>
        )}
      </div>

      {/* ── Text input — positioned above status bar ── */}
      <div className={`orb-input-wrap ${bootPhase >= 4 ? 'input-visible' : ''}`}>
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
        >›</button>
      </div>

      {/* ── Dynamic panels ── */}

      <div className={`panel panel-convo ${showConvo ? 'panel-visible' : ''}`}>
        <button className="panel-close" onClick={() => { setShowConvo(false); clearTimeout(convoTimerRef.current) }}>✕</button>
        <ConversationLog conversation={conversation} />
      </div>

      <div className={`panel panel-weather ${showWeather ? 'panel-visible' : ''}`}>
        <WeatherWidget />
      </div>

      <div className={`panel panel-finance ${showFinance ? 'panel-visible' : ''}`}>
        <div className="panel-finance-header">
          <span style={{ fontSize: 9, letterSpacing: '3px', color: 'rgba(0,212,255,0.5)' }}>◈ FINANCES</span>
          <button className="panel-close" onClick={() => setShowFinance(false)}>✕ CLOSE</button>
        </div>
        <FinanceWidget />
      </div>

      {playerState && (
        <div className="panel panel-music panel-visible">
          <NowPlaying playerState={playerState} onControl={handleNowPlayingControl} />
        </div>
      )}

      {/* ── Status bar: always visible after boot ── */}
      <div className={`status-bar ${bootPhase >= 4 ? 'status-visible' : ''}`}>
        <div className="sb-left">
          <button
            className={`sb-mode sb-mode-${mode}`}
            onClick={cycleMode}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', padding: 0, fontSize: 'inherit', letterSpacing: 'inherit' }}
          >
            ◈ {mode.toUpperCase()}
          </button>
          {!spotifyAuth && (
            <button className="spotify-connect-btn" onClick={initiateLogin}>
              <SpotifyIcon /> SPOTIFY
            </button>
          )}
          {!calendarConnected ? (
            <button className="gcal-connect-btn" onClick={initiateCalendarAuth}>◈ GCAL</button>
          ) : nextEvent ? (
            <span className="sb-cal-badge">
              {nextEvent.allDay ? nextEvent.title : `${formatEventTime(nextEvent)} ${nextEvent.title}`}
            </span>
          ) : null}
        </div>
        <div className="sb-center">
          <span className={`sb-status-dot sb-dot-${status}`} />
          <span className="sb-status-label">{status.toUpperCase()}</span>
        </div>
        <div className="sb-right">
          {serviceStatus.map(s => (
            <span key={s.id} className={`sb-service-dot ${s.on ? 'sb-dot-on' : 'sb-dot-off'}`} title={s.id.toUpperCase()} />
          ))}
          <span className="sb-api-count">{apiCallCount} API</span>
          <SbClock />
        </div>
      </div>
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

function SbClock() {
  const [t, setT] = useState(() =>
    new Date().toLocaleTimeString('en-US', { timeZone: 'Pacific/Honolulu', hour: '2-digit', minute: '2-digit', hour12: true })
  )
  useEffect(() => {
    const id = setInterval(() => setT(
      new Date().toLocaleTimeString('en-US', { timeZone: 'Pacific/Honolulu', hour: '2-digit', minute: '2-digit', hour12: true })
    ), 30000)
    return () => clearInterval(id)
  }, [])
  return <span className="sb-clock">{t} HST</span>
}
