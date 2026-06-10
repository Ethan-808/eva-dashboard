// Local intent classifier — handles requests without hitting the Claude API
import { isCalendarConnected } from './calendar/auth.js'
import { fetchTodayEvents, formatEventTime } from './calendar/api.js'

const GREETINGS = [
  "Hey Ethan, I'm here. What do you need?",
  "Hi! Ready when you are.",
  "Hello, Ethan. What's on your mind?",
  "Hey — I'm listening.",
  "Good to hear from you. What's up?",
]

// Returns one of: 'time'|'weather'|'news'|'calendar'|'math'|'greeting'|'stocks'|'music'|null
export function classifyIntent(text) {
  const t = text.toLowerCase()

  // Music commands — checked first so "play X" doesn't fall to stocks/news etc.
  if (/^(pause|resume|unpause|pause music|stop music|stop the music)$/.test(t.trim())) return 'music'
  if (/^(skip|next|next song|next track|previous|prev|previous song|go back|last song)$/.test(t.trim())) return 'music'
  if (/\b(volume up|volume down|turn it up|turn it down|louder|quieter|lower the volume)\b/.test(t)) return 'music'
  if (/\bwhat.{0,15}(playing|song|track)\b|now playing|currently playing/.test(t)) return 'music'
  if (/\bplay.{0,20}playlist\b/.test(t)) return 'music'
  if (/^play\s+\w/.test(t) && !/\b(game|chess|video|movie|film|podcast|youtube)\b/.test(t)) return 'music'

  if (/\b(what.{0,10}(time|date|day)|current time|what time|clock)\b/.test(t)) return 'time'
  if (/\b(weather|temperature|how.{0,8}(hot|cold|warm)|raining|sunny|forecast|outside)\b/.test(t)) return 'weather'
  if (/\b(news|headlines|what.{0,10}happening|latest news|breaking)\b/.test(t)) return 'news'
  if (/\b(schedule|calendar|my day|today.{0,10}plan|agenda|appointments)\b/.test(t)) return 'calendar'
  if (/[\d]+\s*([\+\-\*x×÷\/]|plus|minus|times|divided)\s*[\d]+/.test(t)) return 'math'
  if (/\b(stock price|share price|ticker|trading at|price of|how much is)\b/.test(t) ||
      /\b(stock|market|nasdaq|s&p|dow)\b/.test(t) ||
      /\b(aapl|tsla|nvda|goog|amzn|msft|meta|nflx|spy|qqq|btc|eth)\b/.test(t) ||
      /\b(apple|tesla|nvidia|google|amazon|microsoft|bitcoin|ethereum|crypto)\b/.test(t)) return 'stocks'
  if (/^(hey\s+(eva|there)|hi(\s+eva)?|hello(\s+eva)?|good\s+(morning|afternoon|evening|night))\b/.test(t)) return 'greeting'

  return null
}

// Dynamic max_tokens: 150 for voice, 400 for writing/long tasks
export function getMaxTokens(text) {
  const t = text.toLowerCase()
  const isLong = /\b(write|compose|draft|create|email|letter|essay|explain|summarize|list all|detailed|full)\b/.test(t)
  return isLong ? 400 : 120
}

// --- Fast-path handlers ---

export async function handleTime() {
  const now = new Date()
  const hst = now.toLocaleString('en-US', {
    timeZone: 'Pacific/Honolulu',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `It's ${hst} Hawaii time.`
}

export async function handleWeather(text) {
  const locMatch = text.match(/(?:weather|temperature|forecast|outside)\s+(?:in|at|for)\s+([a-zA-Z\s,]+?)(?:\?|$)/i)
  const location = locMatch?.[1]?.trim() || 'Honolulu'
  const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY

  if (apiKey) {
    try {
      const res = await fetch(
        `/api/weather/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=imperial`
      )
      if (!res.ok) throw new Error()
      const d = await res.json()
      const desc = d.weather[0].description
      const temp = Math.round(d.main.temp)
      const feels = Math.round(d.main.feels_like)
      const humidity = d.main.humidity
      const city = d.name
      return `In ${city}, it's ${desc} and ${temp}°F, feels like ${feels}. Humidity ${humidity}%.`
    } catch {
      // fall through to wttr.in
    }
  }

  // Fallback: wttr.in (no key required)
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`)
    if (!res.ok) throw new Error()
    const data = await res.json()
    const c = data.current_condition[0]
    const area = data.nearest_area?.[0]?.areaName?.[0]?.value || location
    return `In ${area}, it's ${c.weatherDesc[0].value} and ${c.temp_F}°F, feels like ${c.FeelsLikeF}.`
  } catch {
    return "Sorry, I couldn't fetch the weather right now."
  }
}

export async function handleNews() {
  const apiKey = import.meta.env.VITE_NEWS_API_KEY
  if (!apiKey) return "News isn't configured yet — add VITE_NEWS_API_KEY to your .env file."
  try {
    const res = await fetch(`/api/news/v2/top-headlines?country=us&pageSize=3&apiKey=${apiKey}`)
    if (!res.ok) throw new Error()
    const data = await res.json()
    if (!data.articles?.length) return "No headlines available right now."
    const lines = data.articles.slice(0, 3).map((a, i) => `${i + 1}. ${a.title}`)
    return `Here are today's top headlines: ${lines.join('. ')}`
  } catch {
    return "Sorry, I couldn't fetch the news right now."
  }
}

export async function handleCalendar() {
  if (isCalendarConnected()) {
    const events = await fetchTodayEvents()
    if (!events.length) return "Your calendar is clear today."
    const now = new Date()
    const upcoming = events.filter(e => e.allDay || new Date(e.end) > now)
    if (!upcoming.length) return "No more events today."
    if (upcoming.length === 1) {
      const e = upcoming[0]
      return e.allDay ? `One event today: ${e.title}.` : `Next up: ${e.title} at ${formatEventTime(e)}.`
    }
    const next = upcoming[0]
    return `${upcoming.length} events today. Next: ${next.title}${next.allDay ? '' : ` at ${formatEventTime(next)}`}.`
  }
  const notes = JSON.parse(localStorage.getItem('eva_notes') || '[]')
  if (notes.length === 0) return "You have nothing saved on your schedule."
  const items = notes.map((n) => `${n.title}: ${n.content}`).join('. ')
  return `Here's what I have for you: ${items}`
}

export function handleMath(text) {
  const match = text.match(/([\d]+(?:\.\d+)?)\s*([\+\-\*x×÷\/]|plus|minus|times|divided\s+by)\s*([\d]+(?:\.\d+)?)/i)
  if (!match) return null
  const a = parseFloat(match[1])
  const op = match[2].toLowerCase().trim()
  const b = parseFloat(match[3])
  let result
  if (op === '+' || op === 'plus') result = a + b
  else if (op === '-' || op === 'minus') result = a - b
  else if (op === '*' || op === 'x' || op === '×' || op === 'times') result = a * b
  else if (op === '/' || op === '÷' || op.startsWith('divided')) {
    if (b === 0) return "Can't divide by zero."
    result = a / b
  } else return null
  return `${a} ${match[2]} ${b} equals ${parseFloat(result.toPrecision(10))}.`
}

export async function handleStocks(text) {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY
  if (!apiKey) return "Stock quotes aren't configured — add VITE_FINNHUB_API_KEY to your .env."

  // Extract ticker: explicit symbol or common name
  const TICKERS = {
    apple: 'AAPL', tesla: 'TSLA', nvidia: 'NVDA', google: 'GOOGL', alphabet: 'GOOGL',
    amazon: 'AMZN', microsoft: 'MSFT', meta: 'META', netflix: 'NFLX', spy: 'SPY',
    's&p': 'SPY', nasdaq: 'QQQ', bitcoin: 'BINANCE:BTCUSDT', ethereum: 'BINANCE:ETHUSDT',
    crypto: 'BINANCE:BTCUSDT', btc: 'BINANCE:BTCUSDT', eth: 'BINANCE:ETHUSDT',
  }
  const t = text.toLowerCase()
  let symbol = null

  // Try explicit uppercase ticker first (e.g. "TSLA")
  const explicitMatch = text.match(/\b([A-Z]{1,5})\b/)
  if (explicitMatch) symbol = explicitMatch[1]

  // Try named company
  if (!symbol) {
    for (const [name, ticker] of Object.entries(TICKERS)) {
      if (t.includes(name)) { symbol = ticker; break }
    }
  }

  if (!symbol) return "I couldn't identify which stock you're asking about. Try saying the ticker, like 'What's AAPL trading at?'"

  try {
    const [quoteRes, profileRes] = await Promise.all([
      fetch(`/api/finnhub/api/v1/quote?symbol=${symbol}&token=${apiKey}`),
      fetch(`/api/finnhub/api/v1/stock/profile2?symbol=${symbol}&token=${apiKey}`),
    ])
    if (!quoteRes.ok) throw new Error()
    const q = await quoteRes.json()
    const profile = profileRes.ok ? await profileRes.json() : {}
    if (!q.c) return `Couldn't find a quote for ${symbol}.`

    const price = q.c.toFixed(2)
    const change = (q.d ?? 0).toFixed(2)
    const pct = (q.dp ?? 0).toFixed(2)
    const direction = q.d >= 0 ? 'up' : 'down'
    const name = profile.name || symbol

    return `${name} (${symbol}) is trading at $${price}, ${direction} ${Math.abs(change)} or ${Math.abs(pct)}% today.`
  } catch {
    return `Sorry, I couldn't fetch the quote for ${symbol} right now.`
  }
}

export function handleGreeting() {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
}

// Returns just the top headline title — used by morning briefing
export async function getTopHeadline() {
  const apiKey = import.meta.env.VITE_NEWS_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(`/api/news/v2/top-headlines?country=us&pageSize=1&apiKey=${apiKey}`)
    if (!res.ok) throw new Error()
    const data = await res.json()
    return data.articles?.[0]?.title || null
  } catch {
    return null
  }
}
