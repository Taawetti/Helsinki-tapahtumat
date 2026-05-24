import { DateFilter } from './types'

export function getDateRange(filter: DateFilter): { start: string; end: string; startAfter?: string } {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  switch (filter) {
    case 'today':
      return { start: fmt(now), end: fmt(now) }

    case 'tonight': {
      // Events starting 17:00 or later today
      const tonightStart = new Date(now)
      tonightStart.setHours(17, 0, 0, 0)
      return { start: fmt(now), end: fmt(now), startAfter: tonightStart.toISOString() }
    }

    case 'tomorrow': {
      const t = new Date(now)
      t.setDate(t.getDate() + 1)
      return { start: fmt(t), end: fmt(t) }
    }

    case 'weekend': {
      const day = now.getDay() // 0=Sun, 6=Sat
      const daysToSat = day === 6 ? 0 : (6 - day)
      const sat = new Date(now)
      sat.setDate(now.getDate() + daysToSat)
      const sun = new Date(sat)
      sun.setDate(sat.getDate() + 1)
      return { start: fmt(sat), end: fmt(sun) }
    }

    case 'week': {
      const end = new Date(now)
      end.setDate(end.getDate() + 7)
      return { start: fmt(now), end: fmt(end) }
    }

    case 'month': {
      const end = new Date(now)
      end.setMonth(end.getMonth() + 1)
      return { start: fmt(now), end: fmt(end) }
    }
  }
}

export function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString('fi-FI', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  })
}

export function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateRange(start: string, end: string | null): string {
  if (!end) return `${formatDate(start)} klo ${formatTime(start)}`
  const startDate = new Date(start)
  const endDate = new Date(end)
  const sameDay = startDate.toDateString() === endDate.toDateString()
  if (sameDay) {
    return `${formatDate(start)} klo ${formatTime(start)}–${formatTime(end)}`
  }
  return `${formatDate(start)} – ${formatDate(end)}`
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}

export function isTonight(isoString: string): boolean {
  const date = new Date(isoString)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  return isToday && date.getHours() >= 17
}

// Appends affiliate tracking parameters to known ticket vendor URLs.
// Set env vars in .env.local to activate each vendor's affiliate program.
export function affiliateUrl(url: string | null | undefined): string | null {
  if (!url) return null

  try {
    const u = new URL(url)

    // Ticketmaster (Finland + global) — affiliate via camefrom param
    // Join: https://developer.ticketmaster.com/products-and-docs/partner/
    if (u.hostname.includes('ticketmaster')) {
      const code = process.env.NEXT_PUBLIC_TM_AFFILIATE
      if (code) u.searchParams.set('camefrom', code)
      return u.toString()
    }

    // Lippupiste / Lippu.fi — affiliate via affiliate param
    // Join: https://www.lippu.fi/affiliate
    if (u.hostname.includes('lippu.fi') || u.hostname.includes('lippupiste')) {
      const code = process.env.NEXT_PUBLIC_LIPPU_AFFILIATE
      if (code) u.searchParams.set('affiliate', code)
      return u.toString()
    }

    // Eventbrite — affiliate via aff param
    if (u.hostname.includes('eventbrite')) {
      const code = process.env.NEXT_PUBLIC_EVENTBRITE_AFFILIATE
      if (code) u.searchParams.set('aff', code)
      return u.toString()
    }
  } catch {
    // malformed URL, return as-is
  }

  return url
}
