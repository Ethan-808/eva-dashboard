# EVA Dashboard

Personal AI assistant dashboard — voice-first, JARVIS-style. React + Vite SPA, runs locally via `npm run dev`.

## Running

```bash
npm run dev        # dev server at http://127.0.0.1:5173
npm run build      # production build to dist/
```

On Windows: double-click `EVA.bat` — starts the dev server and opens Chrome in app-window mode.

## Environment Variables

All in a `.env` file at project root. All are optional; missing keys degrade gracefully (status-bar dots go red).

| Variable | Purpose |
|---|---|
| `VITE_CLAUDE_API_KEY` | Anthropic API key — injected server-side by Vite proxy, never exposed to browser |
| `VITE_ELEVENLABS_API_KEY` | ElevenLabs TTS; falls back to browser SpeechSynthesis if absent |
| `VITE_OPENWEATHER_API_KEY` | Weather; falls back to wttr.in (no key needed) |
| `VITE_NEWS_API_KEY` | NewsAPI headlines |
| `VITE_FINNHUB_API_KEY` | Stock quotes |
| `VITE_SPOTIFY_CLIENT_ID` | Spotify PKCE OAuth |
| `VITE_SPOTIFY_REDIRECT_URI` | Defaults to `http://127.0.0.1:5173/callback` |
| `VITE_GOOGLE_CLIENT_ID` | Google Calendar implicit OAuth |

## API Proxy Routes (vite.config.js)

All external API calls go through Vite's dev-server proxy to avoid CORS. Never call external APIs directly from browser code.

| Prefix | Target |
|---|---|
| `/api/claude` | `https://api.anthropic.com` — injects `x-api-key` + `anthropic-version`, strips `origin` header |
| `/api/weather` | `https://api.openweathermap.org` |
| `/api/news` | `https://newsapi.org` |
| `/api/finnhub` | `https://finnhub.io` |
| `/api/gcal` | `https://www.googleapis.com` |

The Claude proxy strips the browser `origin` header so Anthropic treats the request as server-side.

## Architecture

```
src/
  App.jsx              # Root — all state, voice pipeline, boot sequence
  intent.js            # Fast-path classifier (no API call for simple queries)
  cache.js             # Jaccard-similarity response cache (localStorage, 10-min TTL)
  index.css            # All styles — design tokens in :root CSS variables

  components/
    EvaOrb3D.jsx       # Three.js animated orb — central UI element
    StarField.jsx       # Background particle field
    ConversationLog.jsx # Chat history panel
    WeatherWidget.jsx   # Weather panel (Honolulu)
    NowPlaying.jsx      # Spotify currently-playing card
    FinanceWidget.jsx   # Net worth + subscriptions panel + edit modal
    NetWorthChart.jsx   # Chart.js line chart — seeded with $0 if no history
    AssetsDonut.jsx     # Chart.js doughnut — shows gray ring when all assets are zero

  finance/
    data.js            # localStorage CRUD — getData/saveData/snapshotNetWorth
    chartSetup.js      # Chart.js tree-shaken registration

  spotify/
    auth.js            # PKCE OAuth flow (initiateLogin / handleCallback / getToken)
    player.js          # Web Playback SDK wrapper
    commands.js        # Voice command handlers (play/pause/skip/volume)
    api.js             # Spotify REST calls

  calendar/
    auth.js            # Google implicit OAuth (token stored in localStorage)
    api.js             # Calendar API — fetchTodayEvents / formatEventTime
```

## Voice Pipeline (App.jsx)

Boot sequence → passive listening → wake word "Hey EVA" → active listening → `sendToEva()`:

1. **Intent classifier** (`intent.js`) — handles time/weather/news/math/stocks/music/calendar/greeting locally, no API call
2. **Response cache** (`cache.js`) — Jaccard similarity ≥ 0.8 against recent queries, 10-min TTL
3. **Claude API** — streaming SSE via `/api/claude/v1/messages`, model `claude-sonnet-4-6`, tool use loop

TTS pipeline: `trySpeakNext()` splits on sentence boundaries and streams chunks to `queueSpeakChunk()` as Claude streams tokens — so speech starts before the full response is done.

**`cleanForTTS(text)`** must be called on every string before passing to ElevenLabs or SpeechSynthesis. It strips emojis (Unicode property escapes), markdown (`** * # \` ~`), and converts em/en dashes to commas.

ElevenLabs voice settings: `stability: 0.6, similarity_boost: 0.75, style: 0.3` (calm, measured).
Browser TTS fallback: `rate: 0.95, pitch: 0.88`.

## Work Modes

Status-bar label cycles through `personal → senate → startup → content` on click. Each has a distinct color defined in CSS (`.sb-mode-personal`, etc.). Mode is cosmetic only — no behavior change currently.

## Finance Data (localStorage)

Key: `eva_finance`. Schema:
```js
{
  assets:          { checking, savings, investments, crypto, other },
  liabilities:     { creditCard, loans, other },
  subscriptions:   [{ name, amount, billingCycle }],
  netWorthHistory: [{ date: 'YYYY-MM-DD', amount: number }],  // max 90 entries
  income:          [{ source, amount, date: 'YYYY-MM-DD' }],
}
```

`snapshotNetWorth()` upserts today's net worth into history on every finance widget mount and after any asset/liability update. `NetWorthChart` seeds `[{ date: today, amount: 0 }]` when history is empty so the chart always renders.

## Other localStorage Keys

| Key | Contents |
|---|---|
| `eva_notes` | `[{ title, content, created }]` — saved via `save_note` tool |
| `eva_response_cache` | `[{ query, response, ts }]` — Jaccard response cache |
| `eva_spotify_auth` | `{ access_token, refresh_token, expires_at }` |
| `eva_spotify_verifier` | PKCE verifier (cleared after callback) |
| `eva_gcal_token` | Google Calendar access token |
| `eva_gcal_expiry` | Token expiry timestamp |

## Claude Tools

Defined in `App.jsx` as the `TOOLS` array and executed in `executeTool()`:

`get_time` · `get_weather` · `save_note` · `get_notes` · `delete_note` · `get_finance_summary` · `update_asset` · `update_liability` · `log_income`

## Design Tokens (index.css)

```css
--card-bg:     rgba(0, 10, 30, 0.85)
--card-border: rgba(0, 200, 255, 0.15)
--cyan:        #00d4ff
--green:       #4dffa0
--amber:       #ffc840
--red:         #ff4d6d
--font:        'Space Mono', monospace
```

All panels use `.glass-card` or inline styles matching these values. No white or light backgrounds anywhere.

## Chart.js Notes

- Only the required controllers are registered in `finance/chartSetup.js` (tree-shaking)
- `FinanceWidget` renders the charts section with `display: none` when collapsed (not unmounted) so Chart.js instances persist across open/close cycles
- `NetWorthChart` gradient height is hardcoded to `150` to avoid reading `clientHeight` from a potentially-hidden container
