// Response cache — localStorage, last 20 entries, 10-min TTL

const CACHE_KEY = 'eva_response_cache'
const CACHE_MAX = 20
const CACHE_TTL = 10 * 60 * 1000

function tokenize(text) {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean))
}

function jaccard(a, b) {
  const sa = tokenize(a)
  const sb = tokenize(b)
  const intersection = [...sa].filter(x => sb.has(x)).length
  const union = new Set([...sa, ...sb]).size
  return union === 0 ? 0 : intersection / union
}

export function getCached(query) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]')
    const now = Date.now()
    const entry = cache.find(c => now - c.ts < CACHE_TTL && jaccard(c.query, query) >= 0.8)
    return entry?.response ?? null
  } catch {
    return null
  }
}

export function setCached(query, response) {
  try {
    const now = Date.now()
    let cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]')
    cache = cache.filter(c => now - c.ts < CACHE_TTL && jaccard(c.query, query) < 0.8)
    cache.unshift({ query, response, ts: now })
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache.slice(0, CACHE_MAX)))
  } catch {}
}
