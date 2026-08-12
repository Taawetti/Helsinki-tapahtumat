// Torstain pakan (viikkodigestin) kuratointi — PUHDAS logiikka: ei verkkoa,
// ei ympäristöriippuvuuksia, fixture-testattu scripts/test-categories.ts:ssä.
// Kuluttajat: app/pakka/page.tsx (SSR-sivu) ja app/api/cron/thursday-digest
// (push-lähetys torstaisin klo 16).

import type { Event } from './types'
import { helsinkiNow } from './helsinki-time'

export interface DigestPick {
  event: Event
  bucket: string       // suomenkielinen kattilanimi (UI + push)
  bucketEmoji: string
}

type BucketId = 'keikka' | 'kulttuuri' | 'perhe' | 'yoelama' | 'ilmainen'

// Poimintajärjestys = kattiloiden tärkeysjärjestys. Ilmainen VIIMEISENÄ, koska
// se on levein kattila (mikä tahansa maksuton kelpaa) — muuten se varastaisi
// esim. ainoan klubi-illan, ja yoelama-kattila jäisi tyhjäksi.
const BUCKETS: { id: BucketId; label: string; emoji: string }[] = [
  { id: 'keikka',    label: 'Keikka',    emoji: '🎸' },
  { id: 'kulttuuri', label: 'Kulttuuri', emoji: '🎭' },
  { id: 'perhe',     label: 'Perhe',     emoji: '👨‍👩‍👧' },
  { id: 'yoelama',   label: 'Yöelämä',   emoji: '🌃' },
  { id: 'ilmainen',  label: 'Ilmainen',  emoji: '🆓' },
]

// Kattiloiden PÄÄsignaali: aggregaatin laskemat vibes (lib/event-classify.ts).
const BUCKET_VIBES: Record<Exclude<BucketId, 'ilmainen'>, string[]> = {
  keikka: ['keikka'],
  kulttuuri: ['teatteri', 'taide', 'museo'],
  perhe: ['lapset'],
  yoelama: ['yoelama', 'baari', 'underground'],
}

// Fallback kun vibes-lista on tyhjä/puuttuu (vanhat välimuistivastaukset).
// 'klassinen' ei ole oma vibe (klassiset konsertit luokitellaan keikaksi),
// joten kulttuuri-kattilaan pääsee kategorioiden kautta.
const BUCKET_CATEGORY_KEYWORDS: Record<Exclude<BucketId, 'ilmainen'>, string[]> = {
  keikka: ['musiikki', 'keikka', 'konsertti', 'music'],
  kulttuuri: ['teatteri', 'tanssi', 'näyttely', 'taide', 'museo', 'klassinen', 'sinfonia', 'ooppera', 'classical'],
  perhe: ['lapset', 'perhe', 'lasten', 'kids', 'children'],
  yoelama: ['yöelämä', 'yökerho', 'klubi', 'baari', 'club', 'nightclub'],
}

/** Kattilat joihin tapahtuma kelpaa. Vibes ensisijaisesti; tyhjällä
 *  vibes-listalla kategorioiden avainsanat. Ilmainen-kattila = isFree. */
function eventBuckets(e: Event): BucketId[] {
  const vibes = e.vibes ?? []
  const out: BucketId[] = []
  for (const b of BUCKETS) {
    if (b.id === 'ilmainen') {
      if (e.isFree) out.push('ilmainen')
      continue
    }
    const id = b.id as Exclude<BucketId, 'ilmainen'>
    const vibeHit = vibes.some((v) => BUCKET_VIBES[id].includes(v))
    const catHit = vibes.length === 0 && e.categories.some((c) => {
      const lc = c.toLowerCase()
      return BUCKET_CATEGORY_KEYWORDS[id].some((k) => lc.includes(k))
    })
    if (vibeHit || catHit) out.push(id)
  }
  return out
}

const HKI_WD_HOUR = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Helsinki', weekday: 'short', hour: '2-digit', hour12: false,
})

/** Perjantai- tai lauantai-ilta (klo 17–24) Helsingin ajassa. Pelkät
 *  päivämäärämerkinnät (ei kellonaikaa) eivät ole iltoja. */
function isFriSatEvening(iso: string): boolean {
  if (!iso.includes('T')) return false
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return false
  const parts = HKI_WD_HOUR.formatToParts(new Date(t))
  const wd = parts.find((p) => p.type === 'weekday')?.value
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  return (wd === 'Fri' || wd === 'Sat') && hour >= 17 && hour <= 24
}

/** Kattilansisäinen pisteytys: kuva +2, festivaali-vibe +2,
 *  pe/la-ilta +1, ilmainen +0.5. */
function score(e: Event): number {
  let s = 0
  if (e.image) s += 2
  if ((e.vibes ?? []).includes('festivaali')) s += 2
  if (isFriSatEvening(e.startTime)) s += 1
  if (e.isFree) s += 0.5
  return s
}

// Normalisointi duplikaattisuojille: välilyönnit/kirjainkoko pois.
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Poimii viikonlopun digestin: max `size` (oletus 5) tapahtumaa, yksi per
 *  kattila. Ei kahta samaan paikkaan (location.name normalisoituna), ei
 *  duplikaattia otsikolla, ei samaa tapahtumaa kahdesti. Alle 5 jos
 *  kattiloita puuttuu — ei täytetä väkisin. */
export function pickWeeklyDigest(events: Event[], opts?: { size?: number }): DigestPick[] {
  const size = Math.max(0, opts?.size ?? 5)
  const usedIds = new Set<string>()
  const usedTitles = new Set<string>()
  const usedVenues = new Set<string>()
  const picks: DigestPick[] = []

  for (const bucket of BUCKETS) {
    if (picks.length >= size) break
    const best = events
      .filter((e) => eventBuckets(e).includes(bucket.id))
      .filter((e) => !usedIds.has(e.id))
      .filter((e) => !usedTitles.has(norm(e.title)))
      .filter((e) => {
        const v = e.location?.name ? norm(e.location.name) : ''
        return !v || !usedVenues.has(v)
      })
      // Tasapelit: aikaisempi alkaa ensin, sitten aakkoset — deterministinen.
      .sort((a, b) =>
        score(b) - score(a) ||
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime() ||
        a.title.localeCompare(b.title, 'fi'),
      )[0]
    if (!best) continue
    picks.push({ event: best, bucket: bucket.label, bucketEmoji: bucket.emoji })
    usedIds.add(best.id)
    usedTitles.add(norm(best.title))
    const v = best.location?.name ? norm(best.location.name) : ''
    if (v) usedVenues.add(v)
  }

  return picks
}

export interface WeekendRange {
  fri: string   // YYYY-MM-DD
  sat: string
  sun: string
  label: string // "pe 14.8. – su 16.8."
}

/** Tulevan viikonlopun pe–su Helsingin ajassa. Pe–su aikana = TÄMÄ viikonloppu,
 *  ma–to = tuleva (torstaina pakka lähtee → huominen perjantai).
 *  `now` injektoitavissa; oletuksena helsinkiNow(), jonka paikalliset
 *  getterit palauttavat Helsinki-aikaa myös UTC-palvelimella. */
export function nextWeekendRange(now: Date = helsinkiNow()): WeekendRange {
  const day = now.getDay() // 0=su … 5=pe, 6=la
  // pe→0, la→-1 (pe oli eilen), su→-2, ma→4, ti→3, ke→2, to→1
  const daysToFri = day === 5 ? 0 : day === 6 ? -1 : day === 0 ? -2 : (5 - day + 7) % 7
  const fri = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToFri)
  const sat = new Date(fri.getFullYear(), fri.getMonth(), fri.getDate() + 1)
  const sun = new Date(fri.getFullYear(), fri.getMonth(), fri.getDate() + 2)
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const fi = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`
  return { fri: iso(fri), sat: iso(sat), sun: iso(sun), label: `pe ${fi(fri)} – su ${fi(sun)}` }
}
