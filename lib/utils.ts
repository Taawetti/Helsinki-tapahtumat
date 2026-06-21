import { DateFilter } from './types'

export function getDateRange(filter: DateFilter, customDate?: string, customDateEnd?: string): { start: string; end: string; startAfter?: string } {
  const now = new Date()
  // Use local date components (not UTC) — avoids returning yesterday's date for Helsinki
  // users between midnight and 3 AM when UTC is still on the previous day.
  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  switch (filter) {
    case 'today':
      return { start: fmt(now), end: fmt(now) }

    case 'tonight': {
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
      const day = now.getDay()
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

    case 'custom': {
      const date = customDate || fmt(now)
      return { start: date, end: date }
    }

    case 'range': {
      const start = customDate || fmt(now)
      const end = customDateEnd || customDate || fmt(now)
      return { start, end }
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
