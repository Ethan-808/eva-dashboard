const STORAGE_KEY = 'eva_finance'

const DEFAULTS = {
  assets: { checking: 0, savings: 0, investments: 0, crypto: 0, other: 0 },
  liabilities: { creditCard: 0, loans: 0, other: 0 },
  subscriptions: [
    { name: 'Claude Pro',  amount: 20, billingCycle: 'monthly' },
    { name: 'Spotify',     amount: 11, billingCycle: 'monthly' },
    { name: 'iCloud',      amount: 3,  billingCycle: 'monthly' },
    { name: 'Google One',  amount: 3,  billingCycle: 'monthly' },
  ],
  netWorthHistory: [],
  income: [],
}

export function getData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULTS)
    const saved = JSON.parse(raw)
    return {
      assets:          { ...DEFAULTS.assets,       ...saved.assets },
      liabilities:     { ...DEFAULTS.liabilities,  ...saved.liabilities },
      subscriptions:   Array.isArray(saved.subscriptions) ? saved.subscriptions : structuredClone(DEFAULTS.subscriptions),
      netWorthHistory: Array.isArray(saved.netWorthHistory) ? saved.netWorthHistory : [],
      income:          Array.isArray(saved.income) ? saved.income : [],
    }
  } catch {
    return structuredClone(DEFAULTS)
  }
}

export function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  window.dispatchEvent(new CustomEvent('eva-finance-update'))
}

export function getNetWorth(data = getData()) {
  const assets = Object.values(data.assets).reduce((a, b) => a + b, 0)
  const liabs  = Object.values(data.liabilities).reduce((a, b) => a + b, 0)
  return assets - liabs
}

export function getMonthlyBurn(data = getData()) {
  return data.subscriptions.reduce((sum, s) => {
    if (s.billingCycle === 'annual') return sum + s.amount / 12
    return sum + s.amount
  }, 0)
}

export function getMonthlyIncome(data = getData()) {
  const now   = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return data.income
    .filter(e => e.date.startsWith(month))
    .reduce((sum, e) => sum + e.amount, 0)
}

// Upsert today's net worth into history; trims to 90 entries.
export function snapshotNetWorth() {
  const data  = getData()
  const nw    = getNetWorth(data)
  const today = new Date().toISOString().slice(0, 10)
  const idx   = data.netWorthHistory.findIndex(h => h.date === today)
  if (idx >= 0) data.netWorthHistory[idx].amount = nw
  else          data.netWorthHistory.push({ date: today, amount: nw })
  if (data.netWorthHistory.length > 90) data.netWorthHistory = data.netWorthHistory.slice(-90)
  saveData(data)
  return nw
}
