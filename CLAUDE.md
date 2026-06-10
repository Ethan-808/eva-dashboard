# Claude Code Instructions — EVA Dashboard

## Read first every session
Read README.md before making any changes. It has the 
full architecture, file structure, and design tokens.

## Rules
- One change at a time
- No explanations unless asked
- Never touch .env or node_modules
- Match existing code style exactly
- Use design tokens from index.css, never hardcode colors
- Always call cleanForTTS() before any speech output
- Never add white or light backgrounds — dark theme only

## Current priorities in order
1. Fix finance chart persistence on open/close
2. Morning briefing mode
3. Work modes actually change Claude system prompt
4. Gmail integration
5. Deploy to Vercel

## Never do
- Call Anthropic API directly from browser (use /api/claude proxy)
- Expose API keys in client code
- Add new npm packages without asking first