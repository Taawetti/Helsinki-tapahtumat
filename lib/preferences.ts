import { Event } from './types'

const KEY = 'mt_prefs'
const MAX_CLICKS = 30
const BOOST_MS = 300_000       // 5 min per score unit
const MAX_BOOST_MS = 3_600_000 // cap: 1 hour max advance

interface Click {
  cats: string[]
  ts: number
}

function load(): Click[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Click[]) : []
  } catch {
    return []
  }
}

export function recordClick(event: Event): void {
  if (typeof window === 'undefined') return
  if (!event.categories.length) return
  const clicks = load()
  clicks.push({ cats: event.categories, ts: Date.now() })
  if (clicks.length > MAX_CLICKS) clicks.splice(0, clicks.length - MAX_CLICKS)
  try { localStorage.setItem(KEY, JSON.stringify(clicks)) } catch {}
}

// Returns category → score map derived from last MAX_CLICKS clicks.
// More recent clicks weigh more (index / total). Time decay halves clicks > 7 days old.
export function getCategoryScores(): Record<string, number> {
  const clicks = load()
  if (!clicks.length) return {}
  const now = Date.now()
  const scores: Record<string, number> = {}
  clicks.forEach((click, i) => {
    const recency = (i + 1) / clicks.length
    const ageDays = (now - click.ts) / 86_400_000
    const weight = recency * (ageDays > 7 ? 0.5 : 1)
    for (const cat of click.cats) {
      const k = cat.toLowerCase()
      scores[k] = (scores[k] ?? 0) + weight
    }
  })
  return scores
}

// Virtual start time shifted earlier by preference score — used for sorting only.
export function virtualStartTime(event: Event, scores: Record<string, number>): number {
  const base = new Date(event.startTime).getTime()
  if (!Object.keys(scores).length) return base
  const score = event.categories.reduce((s, cat) => s + (scores[cat.toLowerCase()] ?? 0), 0)
  return base - Math.min(score * BOOST_MS, MAX_BOOST_MS)
}
