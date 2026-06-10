# EVA Dashboard — Project Context

## Stack
React + Vite, Three.js, Chart.js, deployed to Vercel

## Key Files
- src/App.jsx — main app, top level layout
- src/main.jsx — entry point
- src/intent.js — intent routing (Claude vs free APIs)
- src/cache.js — response caching

## Components
- EvaOrb.jsx — main orb
- EvaOrb3D.jsx — Three.js 3D orb
- ParticleField.jsx — background particles
- StarField.jsx — background stars
- ConversationLog.jsx — chat history
- FinanceWidget.jsx — finance panel
- NetWorthChart.jsx — net worth line chart
- AssetsDonut.jsx — assets donut chart
- WeatherWidget.jsx — weather display
- MarketWidget.jsx — stocks ticker
- NowPlaying.jsx — Spotify widget
- ClockWidget.jsx — HST clock
- StatusBar.jsx — bottom API status bar
- Waveform.jsx — voice waveform

## Feature Modules
- src/calendar/api.js — Calendar API calls
- src/calendar/auth.js — Google OAuth
- src/finance/chartSetup.js — Chart.js config
- src/finance/data.js — net worth data/localStorage
- src/spotify/api.js — Spotify API calls
- src/spotify/auth.js — Spotify OAuth
- src/spotify/commands.js — voice command handlers
- src/spotify/player.js — playback control

## APIs
- Claude: VITE_CLAUDE_API_KEY
- ElevenLabs: VITE_ELEVENLABS_API_KEY
- OpenWeatherMap: VITE_OPENWEATHER_API_KEY
- NewsAPI: VITE_NEWS_API_KEY
- Finnhub: VITE_FINNHUB_API_KEY
- Spotify: VITE_SPOTIFY_CLIENT_ID
- Google Calendar: VITE_GOOGLE_CLIENT_ID

## EVA Personality
Witty, sharp, concise. Max 2 sentences unless detail 
requested. No emojis in speech. Knows Ethan: Stanford 
freshman, Hawaii senate intern, Blue Startups accelerator,
The Yang Thesis YouTube channel.

## Known Issues
- Finance chart disappears on re-render
- Speech rate too fast
- UI panels need polish
- Emoji/markdown not stripped from TTS