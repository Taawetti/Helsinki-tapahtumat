// Digitransit (HSL) reititys — todelliset joukkoliikenneajat kaaren väleille.
// Vaatii ilmaisen DIGITRANSIT_API_KEY-avaimen (dev-portal.digitransit.fi);
// ilman avainta kaari käyttää Reittiopas-linkkiä kuten aiemmin (fallback).
import type { PlanStep } from '@/lib/group'

const ENDPOINT = 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1'

interface Itinerary {
  duration: number                 // sekuntia
  legs: { mode: string; route?: { shortName?: string } }[]
}

async function fetchItinerary(fromLat: number, fromLon: number, toLat: number, toLon: number): Promise<{ min: number; summary: string } | null> {
  const key = process.env.DIGITRANSIT_API_KEY
  if (!key) return null
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'digitransit-subscription-key': key },
      body: JSON.stringify({
        query: `{ plan(fromPlace:"${fromLat},${fromLon}", toPlace:"${toLat},${toLon}", numItineraries: 1) { itineraries { duration legs { mode route { shortName } } } } }`,
      }),
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const it: Itinerary | undefined = data?.data?.plan?.itineraries?.[0]
    if (!it) return null
    const min = Math.max(1, Math.round(it.duration / 60))
    const MODE_FI: Record<string, string> = { BUS: 'bussi', TRAM: 'raitiovaunu', SUBWAY: 'metro', RAIL: 'juna', FERRY: 'lautta', WALK: 'kävely' }
    const parts = it.legs
      .filter(l => l.mode !== 'WALK' || it.legs.length === 1)
      .slice(0, 2)
      .map(l => `${MODE_FI[l.mode] ?? l.mode.toLowerCase()}${l.route?.shortName ? ' ' + l.route.shortName : ''}`)
    return { min, summary: parts.join(' · ') || 'joukkoliikenne' }
  } catch {
    return null
  }
}

// Rikastaa kaaren transit-vaiheet todellisilla reititysajoilla (jos avain on).
// Ilman avainta palauttaa vaiheet muuttumattomina (Reittiopas-linkki säilyy).
export async function enrichTransitTimes(steps: PlanStep[]): Promise<PlanStep[]> {
  if (!process.env.DIGITRANSIT_API_KEY) return steps
  for (const s of steps) {
    if (s.travelFromPrevMode !== 'transit') continue
    const prev = steps[steps.indexOf(s) - 1]
    if (!prev?.lat || !prev?.lon || !s.lat || !s.lon) continue
    const it = await fetchItinerary(prev.lat, prev.lon, s.lat, s.lon)
    if (it) {
      s.travelFromPrevMin = it.min
      s.travelFromPrevSummary = `~${it.min} min · ${it.summary}`
    }
  }
  return steps
}
