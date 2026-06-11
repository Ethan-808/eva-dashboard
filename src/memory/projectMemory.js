const STORAGE_KEY = 'eva_project_memory'

const DEFAULT_PROJECTS = {
  personal: {
    context: 'Personal life, health, relationships, hobbies, finances.',
    notes: [],
    keyFacts: [],
    lastActive: null,
  },
  senate: {
    context: 'Hawaii state senate internship. Legislative work, policy research, senator relationships.',
    notes: [],
    keyFacts: [],
    lastActive: null,
  },
  startup: {
    context: 'Blue Startups accelerator program. Building a startup, pitching investors.',
    notes: [],
    keyFacts: [],
    lastActive: null,
  },
  content: {
    context: 'The Yang Thesis YouTube channel. Content creation, personal brand building.',
    notes: [],
    keyFacts: [],
    lastActive: null,
  },
}

function getMemory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      for (const [key, val] of Object.entries(DEFAULT_PROJECTS)) {
        if (!parsed.projects[key]) parsed.projects[key] = JSON.parse(JSON.stringify(val))
      }
      return parsed
    }
  } catch {}
  return {
    currentProject: 'personal',
    projects: JSON.parse(JSON.stringify(DEFAULT_PROJECTS)),
  }
}

function saveMemory(mem) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mem))
}

export function getCurrentProject() {
  return getMemory().currentProject
}

export function switchProject(name) {
  const mem = getMemory()
  const key = name.toLowerCase().trim()
  if (!mem.projects[key]) return false
  mem.currentProject = key
  mem.projects[key].lastActive = new Date().toISOString()
  saveMemory(mem)
  return true
}

export function rememberFact(fact) {
  const mem = getMemory()
  const proj = mem.projects[mem.currentProject]
  const trimmed = fact.trim()
  if (!proj.keyFacts.includes(trimmed)) {
    proj.keyFacts.push(trimmed)
    if (proj.keyFacts.length > 20) proj.keyFacts.shift()
  }
  saveMemory(mem)
  return trimmed
}

export function getProjectContext() {
  const mem = getMemory()
  const name = mem.currentProject
  return { name, ...mem.projects[name] }
}

export function buildMemorySystemPrompt() {
  const mem = getMemory()
  const proj = mem.projects[mem.currentProject]
  if (!proj.keyFacts.length) return ''
  return `\n\nRemembered facts about the ${mem.currentProject} project:\n${proj.keyFacts.map(f => `- ${f}`).join('\n')}`
}
