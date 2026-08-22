import { NextRequest, NextResponse } from 'next/server'
import { Event, SourceStatus } from '@/lib/types'
import { getEventImage, fetchImagesCached } from '@/lib/venue-images'
import { helsinkiDateOf, normalizeHelsinkiTimestamp } from '@/lib/helsinki-time'
import { classifyEvent, extractYsoIds } from '@/lib/event-classify'

// Fan-out kestää mitattuna 7–11 s (45 lähdettä + LinkedEventsin päiväpalaset).
// Ilman tätä alusta voi katkaista pyynnön oletuksellaan kesken kaiken, jolloin
// osittainen data näkyisi käyttäjälle täytenä listana.
export const maxDuration = 60

// External sources fetched via internal API routes (api/<name>).
// Order defines merge priority: earlier sources win dedup upgrades first.
const EXTERNAL_SOURCES = [
  'ticketmaster', 'fienta', 'billetto', 'meetup', 'rss', 'venues', 'culture', 'espoo',
  'helmet', 'ilmonet', 'finna', 'visitfinland', 'sports', 'festivals', 'theatre',
  'bars', 'ra', 'museums', 'liiga', 'kide', 'arenas', 'recurring', 'pubivisat',
  'stadissa', 'myhelsinki', 'openings', 'allas', 'lippu', 'scraped',
  'flyingdutchman', 'juttutupa', 'lepakkomies', 'glivelab', 'kulttuuritalo',
  'postbar', 'korjaamo', 'malmitalo', 'vuotalo', 'savoy', 'nauramaan', 'siltanen',
  'apollo', 'maxine', 'tanssintalo',
] as const

interface LinkedEventsImage {
  url: string
}

interface LinkedEventsOffer {
  is_free: boolean
  price?: { fi?: string; en?: string }
  info_url?: { fi?: string; en?: string }
}

interface LinkedEventsLocation {
  name?: { fi?: string; en?: string }
  street_address?: { fi?: string; en?: string }
  address_locality?: { fi?: string; en?: string }
  position?: { coordinates: [number, number] }
}

interface LinkedEventsEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  short_description?: { fi?: string; en?: string }
  description?: { fi?: string; en?: string }
  start_time: string
  end_time?: string
  images?: LinkedEventsImage[]
  location?: LinkedEventsLocation
  offers?: LinkedEventsOffer[]
  keywords?: { '@id'?: string; name: { fi?: string; en?: string } }[]
  info_url?: { fi?: string; en?: string }
}

function normalize(raw: LinkedEventsEvent): Event {
  const title = raw.name?.fi || raw.name?.en || raw.name?.sv || 'Nimetön tapahtuma'
  const shortDescription = raw.short_description?.fi || raw.short_description?.en || ''
  const description = raw.description?.fi || raw.description?.en || ''
  const image = raw.images?.[0]?.url ?? null

  const loc = raw.location
  const locationObj = loc
    ? {
        name: loc.name?.fi || loc.name?.en || '',
        streetAddress: loc.street_address?.fi || loc.street_address?.en || '',
        city: loc.address_locality?.fi || loc.address_locality?.en || 'Helsinki',
        lat: loc.position?.coordinates?.[1],
        lon: loc.position?.coordinates?.[0],
      }
    : null

  const offer = raw.offers?.[0]
  const isFree = offer?.is_free ?? false
  const price = isFree ? null : (offer?.price?.fi || offer?.price?.en || null)
  const ticketUrl = offer?.info_url?.fi || offer?.info_url?.en || null
  const infoUrl = raw.info_url?.fi || raw.info_url?.en || null

  // LinkedEvents palauttaa saman avainsanan toisinaan kahdesti (esim.
  // ["Musiikki","Musiikki"]) → dedup ENNEN 4:n katkaisua, jolloin neljä
  // paikkaa täyttyy uniikeilla kategorioilla eikä toistolla.
  const catSeen = new Set<string>()
  const categories = (raw.keywords || [])
    .map((k) => k.name?.fi || k.name?.en || '')
    .filter(Boolean)
    .filter((c) => { const k = c.toLowerCase(); if (catSeen.has(k)) return false; catSeen.add(k); return true })
    .slice(0, 4)

  return {
    id: raw.id,
    title,
    shortDescription,
    description,
    startTime: raw.start_time,
    endTime: raw.end_time || null,
    location: locationObj,
    image,
    isFree,
    price,
    ticketUrl,
    infoUrl,
    categories,
    ysoIds: extractYsoIds(raw.keywords),
    source: 'linked-events',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start
  const startAfter = searchParams.get('startAfter') || ''
  const page = searchParams.get('page') || '1'
  const keyword = searchParams.get('keyword') || ''
  const municipality = searchParams.get('municipality') || 'helsinki'
  const bbox = searchParams.get('bbox') || '' // neighborhood bounding box

  const quick = searchParams.get('quick') === '1'

  // ── LinkedEvents: per-day chunk fetching ──────────────────────────────
  // LinkedEvents `start=` matches also events STILL ONGOING at that date
  // (exhibitions that began months ago), so any single query mixes hundreds
  // of junk rows with the real ones and no page size or sort direction can
  // cover a multi-day range from the right end. Instead each DAY is fetched
  // as its own one-day query with sort=-start_time: within one day the
  // events actually starting that day have the newest start times, so page 1
  // holds them all and the ongoing junk sinks below. Day-chunks are also
  // ideal fetch-cache units — today, tonight and week views share them.
  const buildLeUrl = (day: string) => {
    const p = new URLSearchParams({
      format: 'json',
      start: day,
      end: day,
      page_size: '100',
      include: 'location,keywords',
      sort: '-start_time',
    })
    // When searching by keyword, skip language filter to catch all languages
    if (!keyword) p.set('language', 'fi')
    // Use bbox for neighborhood filtering, otherwise division (municipality)
    if (bbox) p.set('bbox', bbox)
    else p.set('division', municipality)
    if (keyword) p.set('text', keyword)
    return `https://api.hel.fi/linkedevents/v1/event/?${p}`
  }

  try {
    const extraParams = new URLSearchParams({ start, end, ...(keyword ? { keyword } : {}) })
    const origin = req.nextUrl.origin

    // Helper: fetch an internal API route — catches ALL errors (incl. AbortSignal.timeout)
    // so they never escape Promise.allSettled in Node 24+
    //
    // RUNKO LUETAAN TÄSSÄ, ei kutsupaikalla. Aiemmin tämä palautti Response-olion
    // heti kun OTSAKKEET saapuivat ja runko jäi lukemattomaksi streamiksi, johon
    // AbortSignal jäi kiinni. Runko luettiin vasta kun LinkedEventsin päiväpalaset
    // (10 päivää ≈ 10 MB) oli parsittu sarjassa — siihen mennessä deadline oli
    // umpeutunut ja abort oli virheistänyt streamin, joten res.json() heitti ja
    // lähde kirjattiin kuolleeksi. Mitattu: 900 ms:ssä vastannut lähde merkittiin
    // pettäneeksi; 10 päivän haussa 44/45 lähdettä katosi näin (2 päivän haussa
    // 45/45 selvisi, koska koko haku mahtui 8 sekuntiin). Kun runko luetaan
    // saman deadlinen sisällä, lähteen kohtalo riippuu vain sen OMASTA nopeudesta.
    const src = async (path: string): Promise<{ events?: Event[] } | null> => {
      try {
        const res = await fetch(`${origin}/${path}?${extraParams}`, {
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) return null
        return (await res.json()) as { events?: Event[] }
      } catch {
        return null
      }
    }

    // quick=1: return only LinkedEvents immediately (used for phase-1 fast load)
    const pageNum = Math.max(1, parseInt(page) || 1)
    const attemptExternal = !quick && page === '1'

    // Client page N covers DAYS_PER_PAGE days of the range: page 1 = days
    // 1-10, page 2 = days 11-20 … so infinite scroll walks a long range
    // (month/map) forward in time. quick fetches only the first day of the
    // window for a fast first paint. Short ranges (today/weekend/week) fit
    // entirely in page 1 → hasMore=false and every filter sees the full data.
    const DAYS_PER_PAGE = 10
    const rangeStartTs = new Date(start).getTime()
    const totalDays = Math.max(1, Math.round((new Date(end).getTime() - rangeStartTs) / 86400000) + 1)
    const firstDayIdx = (pageNum - 1) * DAYS_PER_PAGE
    const dayCount = Math.max(0, Math.min(quick ? 1 : DAYS_PER_PAGE, totalDays - firstDayIdx))
    const dayDates = Array.from({ length: dayCount }, (_, i) =>
      new Date(rangeStartTs + (firstDayIdx + i) * 86400000).toISOString().slice(0, 10)
    )

    // Fetch all day-chunks + external sources in parallel.
    // Fresh options per call — AbortSignal.timeout starts ticking on creation,
    // so a shared signal would shortchange the second fetch wave.
    const leFetchOpts = () => ({ next: { revalidate: 300, tags: ['events'] }, signal: AbortSignal.timeout(10000) })
    const settled = await Promise.allSettled([
      ...dayDates.map((day) => fetch(buildLeUrl(day), leFetchOpts())),
      ...EXTERNAL_SOURCES.map((name) => attemptExternal ? src(`api/${name}`) : Promise.resolve(null)),
    ])
    const dayResults = settled.slice(0, dayDates.length) as PromiseSettledResult<Response>[]
    const externalRes = settled.slice(dayDates.length) as PromiseSettledResult<{ events?: Event[] } | null>[]

    // Cutoff anchored to THIS PAGE's day-window (not the range start) so
    // deeper pages don't re-admit ongoing rows from the range's first days —
    // those already came with page 1.
    const realCutoff = (dayDates.length > 0 ? new Date(dayDates[0]).getTime() : rangeStartTs) - 24 * 60 * 60 * 1000

    // Collect day-chunks, dedupe by id (the feed itself contains dupes and
    // chunk boundaries can overlap). If a full page of a day is real starts
    // and more remain (festival days), fetch that day's page 2 as well.
    const leRaw: LinkedEventsEvent[] = []
    const seenLeIds = new Set<string>()
    let leChunksOk = 0
    const collect = (rows: LinkedEventsEvent[]) => {
      for (const raw of rows) {
        if (!seenLeIds.has(raw.id)) { seenLeIds.add(raw.id); leRaw.push(raw) }
      }
    }
    // Onko sivu täynnä ikkunaan kuuluvia alkuja → lisää on seuraavalla sivulla.
    const isSaturated = (rows: LinkedEventsEvent[]) =>
      rows.length > 0 && rows.every((raw) => new Date(raw.start_time).getTime() >= realCutoff)

    // Jatkosivun haku. RUNKO LUETAAN TÄSSÄ, saman lupauksen sisällä. Aiemmin
    // jatkosivut haettiin Promise.allSettledillä ja rungot luettiin vasta sen
    // JÄLKEEN silmukassa — täsmälleen se ajoitusansa joka kaatoi 44/45 lähdettä
    // tässä samassa tiedostossa: fetch ratkeaa jo otsakkeista, joten viimeisen
    // vastauksen runko luettiin kun sen oma AbortSignal oli ehtinyt umpeutua.
    const fetchLeDayPage = async (day: string, page: number) => {
      try {
        const res = await fetch(`${buildLeUrl(day)}&page=${page}`, leFetchOpts())
        if (!res.ok) return null
        const j = (await res.json()) as { data?: LinkedEventsEvent[]; meta?: { next?: string | null } }
        return { rows: j.data ?? [], hasNext: !!j.meta?.next }
      } catch {
        return null
      }
    }

    let saturatedDays: { day: string; page: number }[] = []
    for (let i = 0; i < dayResults.length; i++) {
      const r = dayResults[i]
      if (r.status !== 'fulfilled' || !r.value.ok) continue
      let pageData: { data?: LinkedEventsEvent[]; meta?: { next?: string | null } }
      try { pageData = await r.value.json() } catch { continue }
      leChunksOk++
      const rows = pageData.data || []
      collect(rows)
      if (isSaturated(rows) && pageData.meta?.next) saturatedDays.push({ day: dayDates[i], page: 2 })
    }

    // SILMUKKA, ei kiinteä sivu 2. Aiemmin haettiin vain sivu 2, mikä katkaisi
    // päivän 200 tapahtumaan: sivu 1 (100) + sivu 2 (100), loput hiljaa pois.
    // Mitattu suurin yksittäinen päivä 24.9.2026 = 170 alkavaa tapahtumaa, eli
    // katto oli lähempänä kuin miltä näytti — festivaalipäivä ylittää sen.
    // Kierros kerrallaan rinnakkain: kaikki vielä kylläiset päivät samassa
    // aallossa, joten latenssi on sivumäärä × yksi kierros eikä päivät × sivut.
    const LE_MAX_DAY_PAGES = 8
    while (saturatedDays.length > 0) {
      const wave = saturatedDays
      saturatedDays = []
      const waveRes = await Promise.all(wave.map(({ day, page }) => fetchLeDayPage(day, page)))
      for (let i = 0; i < wave.length; i++) {
        const got = waveRes[i]
        if (!got) continue
        collect(got.rows)
        if (isSaturated(got.rows) && got.hasNext && wave[i].page < LE_MAX_DAY_PAGES) {
          saturatedDays.push({ day: wave[i].day, page: wave[i].page + 1 })
        }
      }
    }

    // Total LinkedEvents outage on page 1 is fatal; PARTIAL day failures
    // return 200 but flag linked-events ok:false so the freshness badge and
    // admin health panel surface the hole instead of hiding it.
    if (pageNum === 1 && dayDates.length > 0 && leChunksOk === 0) {
      return NextResponse.json({ error: 'Linked Events API error' }, { status: 502 })
    }
    const leOk = leChunksOk === dayDates.length

    // Filter out permanent exhibitions/ongoing events that started long before the requested date
    let events: Event[] = leRaw
      .map(normalize)
      .filter((e: Event) => new Date(e.startTime).getTime() >= realCutoff)
    // More day-windows left in the range → client can load the next window
    const hasMore = firstDayIdx + dayCount < totalDays
    let total: number = events.length

    // Normalize title for dedup: strip ticket tiers, years, punctuation variation
    function dedupKey(title: string, date: string): string {
      const base = title
        .replace(/\s*\|.*$/, '')            // strip everything after | (ticket tier separators)
        .replace(/\s*[\|–\-]\s*(premium|legacy|standard|vip|gold|silver|early|late|general|suite|seat|ticket|standing|seated|presale|fan\s*club)[\w\s]*/gi, '')
        .replace(/\b20\d{2}\b/g, '')        // strip years
        .replace(/\s*\(päivä\s*\d+\/\d+\)/gi, '') // strip festival day suffix
        .replace(/[^\wäöåÄÖÅ\s]/g, ' ')    // punct → space
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
      return `${base}|${date}`
    }

    // LinkedEventsin OMAT duplikaatit pois: sama toistuva tapahtuma tulee
    // syötteestä monena instanssina (esim. "Omatoiminen omahoitopiste" ×4,
    // sama ohjelma klo 10 ja 14). Sama normalisoitu otsikko + Helsinki-päivä
    // = yksi kortti; päivän varhaisin aika voittaa. Sama tapahtuma saa silti
    // näkyä ERI päivinä (avain sisältää päivän).
    {
      const byKey = new Map<string, Event>()
      for (const e of events) {
        const k = dedupKey(e.title, helsinkiDateOf(e.startTime))
        const prev = byKey.get(k)
        if (!prev || new Date(e.startTime).getTime() < new Date(prev.startTime).getTime()) byKey.set(k, e)
      }
      events = [...byKey.values()]
      total = events.length
    }

    // Merge all external sources — deduplicate by normalized title+date.
    // When a duplicate is found, upgrade the existing event with coordinates
    // from the incoming version (e.g. recurring has coords, Linked Events doesn't).
    // Every attempted source gets a status entry so failures are visible instead of silent.
    const seenMap = new Map(events.map((e, i) => [dedupKey(e.title, helsinkiDateOf(e.startTime)), i]))
    const sources: SourceStatus[] = [{ name: 'linked-events', ok: leOk, count: events.length }]

    // Luokittelu joka ei koskaan heitä — käytetään dedupin vibe-unionissa.
    const safeClassify = (ev: Event | undefined): string[] => {
      if (!ev) return []
      try { return classifyEvent(ev) } catch { return [] }
    }
    let perEventFailures = 0

    for (let i = 0; i < externalRes.length && attemptExternal; i++) {
      const name = EXTERNAL_SOURCES[i]
      const res = externalRes[i]
      let ok = false
      let count = 0
      // rejected / null (timeout, network, non-OK HTTP, bad JSON — kaikki
      // suodattuvat src():ssä) → ok jää falseksi
      if (res.status === 'fulfilled' && res.value) {
        try {
          const incomingRaw: Event[] = res.value.events ?? []
          // AIKAVYÖHYKE ENSIN: skraperit tuottavat naiivia seinäkelloaikaa
          // ("2026-08-22T23:30:00"). Ilman offsetia UTC-palvelin lukee sen 3 h
          // väärin → klo 21+ tapahtumat vaihtavat päivää, putoavat Illalla-
          // näkymästä ja karkaavat dedupista. Normalisointi ENNEN dedup-avainta,
          // koska avain sisältää Helsinki-päivän.
          const incoming: Event[] = incomingRaw.map((e) => ({
            ...e,
            startTime: normalizeHelsinkiTimestamp(e.startTime) ?? e.startTime,
            endTime: normalizeHelsinkiTimestamp(e.endTime),
          }))
          for (const e of incoming) {
            // PER-TAPAHTUMA-ERISTYS: yksi jäsentymätön aikaleima heittää
            // helsinkiDateOf:ssa RangeErrorin. Ilman tätä koko lähteen loput
            // tapahtumat menetettäisiin JA lähde merkittäisiin kuolleeksi,
            // vaikka vain yksi rivi oli rikki.
            try {
            const key = dedupKey(e.title, helsinkiDateOf(e.startTime))
            const existingIdx = seenMap.get(key)
            if (existingIdx !== undefined) {
              // Upgrade existing event with best available data from the incoming duplicate
              const existing = events[existingIdx]
              const upgrades: Partial<Event> = {}
              // LUOKITTELE ENNEN YHDISTÄMISTÄ ja yhdistä vibe-joukot unionilla.
              // Tekstin ja kategorioiden yhdistäminen EI ole monotonista
              // luokittelulle: classifyEvent lukee samaa tekstiä myös
              // excludeKeywords-VETOIHIN, joten lisätty sana voi POISTAA
              // kategorian. Todistettu: kuvauksen sana "perheen" muutti
              // ["keikka"] → ["lapset"], ja kategoria "Klubi" muutti
              // ["museo","taide"] → ["taide","yoelama"]. Vain vibe-unioni takaa
              // että tieto todella vain lisääntyy.
              upgrades.vibes = [
                ...new Set([...(existing?.vibes ?? safeClassify(existing)), ...safeClassify(e)]),
              ]
              if (e.location?.lat && e.location?.lon && !existing?.location?.lat) upgrades.location = e.location
              if (e.image && !existing?.image) upgrades.image = e.image
              if (e.ticketUrl && !existing?.ticketUrl) upgrades.ticketUrl = e.ticketUrl
              if (e.price && !existing?.price) upgrades.price = e.price
              // TODELLINEN kelloaika voittaa keksityn: säilyttäjä valittiin
              // lähdejärjestyksessä, ja aiempi lähde saattoi käyttää kiinteää
              // "T19:00"-oletusta. Ilman tätä "Loosen Jytädisko" jäisi klo 19
              // placeholderiin vaikka toinen lähde tietää sen alkavan 23:30.
              // Dedup-osuma takaa saman Helsinki-päivän, joten avain ei vanhene.
              if (existing?.startTimeApprox && !e.startTimeApprox) {
                upgrades.startTime = e.startTime
                // endTime VAIN jos tulokkaalla on se — muuten säilyttäjän
                // kelvollinen päättymisaika pyyhkiytyisi null:lla (tiedon
                // katoaminen; useimmat skraperit jättävät endTimen tyhjäksi).
                if (e.endTime) upgrades.endTime = e.endTime
                upgrades.startTimeApprox = false
              }
              // TIETO EI SAA VÄHENTYÄ dedupissa. Luokittelu (classifyEvent,
              // alempana) lukee otsikon, kuvauksen ja kategoriat — joten jos
              // säilyttäjällä on niukempi teksti, luokka katoaa. Esimerkki
              // tuotannosta: "Loosen Jytädisko" tuli venues-lähteestä tekstillä
              // "Bar Loose — Helsinki" [Musiikki, Keikka] ja bars-lähteestä
              // oikealla kuvauksella + [DJ, Klubi, Yöelämä]. Ilman tätä yhdistys
              // pudotti koko yoelama-luokittelun.
              // Teksti ja kategoriat yhdistetään NÄYTTÖÄ varten; luokittelu ei
              // enää riipu niistä (vibes on jo asetettu unionina yllä).
              if ((e.shortDescription?.length ?? 0) > (existing?.shortDescription?.length ?? 0)) {
                upgrades.shortDescription = e.shortDescription
              }
              if ((e.description?.length ?? 0) > (existing?.description?.length ?? 0)) {
                upgrades.description = e.description
              }
              // Kirjainkoko normalisoidaan vertailussa mutta säilyttäjän
              // kirjoitusasu voittaa — muuten "juoksu" ja "Juoksu" näkyisivät
              // kahtena erillisenä kategoriana (LinkedEvents pienellä,
              // skraperit isolla alkukirjaimella).
              const catSeen = new Set((existing?.categories ?? []).map((c) => c.toLowerCase()))
              const mergedCats = [...(existing?.categories ?? [])]
              for (const c of e.categories ?? []) {
                const k = c.toLowerCase()
                if (!catSeen.has(k)) { catSeen.add(k); mergedCats.push(c) }
              }
              if (mergedCats.length > (existing?.categories?.length ?? 0)) upgrades.categories = mergedCats
              // ysoIds ovat luokittelun tarkin signaali (L0) — myös ne yhdistetään
              const mergedYso = [...new Set([...(existing?.ysoIds ?? []), ...(e.ysoIds ?? [])])]
              if (mergedYso.length > (existing?.ysoIds?.length ?? 0)) upgrades.ysoIds = mergedYso
              if (Object.keys(upgrades).length > 0) events[existingIdx] = { ...existing, ...upgrades }
            } else {
              seenMap.set(key, events.length)
              events.push(e)
              total++
            }
            } catch (err) {
              perEventFailures++
              console.warn(`[events] ${name}: tapahtuma ohitettu (${(err as Error).message})`, e?.id)
            }
          }
          // Status only after the whole batch merged — a mid-merge throw
          // (malformed row) must not report the source as both ok and counted.
          ok = true
          count = incoming.length
        } catch {
          ok = false
          count = 0
        }
      }
      sources.push({ name, ok, count })
    }

    // Enforce date boundaries for all sources — external APIs may ignore the date params
    // and return events from wrong dates (e.g. past events, future events, wrong month).
    // Compare HELSINKI calendar dates: LinkedEvents emits Z-suffixed UTC times, so a
    // naive ISO-prefix compare would assign a 00:30 Helsinki event to the previous day.
    events = events.filter((e: Event) => {
      const d = helsinkiDateOf(e.startTime)
      return d >= start && d <= end
    })

    if (startAfter) {
      // Compare as timestamps, not strings — startAfter is UTC (…Z) while most
      // sources emit +03:00 offsets, so lexicographic comparison lets in events
      // up to 3 h before the intended cutoff.
      const cutoff = new Date(startAfter).getTime()
      events = events.filter((e: Event) => new Date(e.startTime).getTime() >= cutoff)
    }

    events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    // Sarja-tason kuvan lainaus: monipäiväisen festarin/sarjan yksi instanssi voi
    // olla kuvaton (esim. festivals-lähteen "Craft Beer Garden … – CoolHead Brew"
    // lauantaina), kun sama sarja on TOISENA päivänä KUVALLISENA toisesta lähteestä
    // ("Craft Beer Garden Festival 2026" perjantaina, linked-events). Päivä-avaimen
    // dedup ei yhdistä eri päiviä, joten lainataan kuva saman sarjan (normalisoitu
    // otsikko, 3 ensimmäistä sanaa) kuvalliselta instanssilta.
    {
      const normBase = (title: string): string => title
        .replace(/\s*\|.*$/, '')
        .replace(/\b20\d{2}\b/g, '')
        .replace(/\s*\(päivä\s*\d+\/\d+\)/gi, '')
        .replace(/[^\wäöåÄÖÅ\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
      // Ryhmittely 3 ensimmäisellä sanalla (nopea); alle 3 sanaa = liian geneerinen.
      const key3 = (base: string): string => {
        const w = base.split(' ').filter(Boolean)
        return w.length >= 3 ? w.slice(0, 3).join(' ') : ''
      }
      const donors = new Map<string, { base: string; image: string }>()
      for (const e of events) {
        if (!e.image) continue
        const base = normBase(e.title)
        const k = key3(base)
        if (k && !donors.has(k)) donors.set(k, { base, image: e.image })
      }
      for (const e of events) {
        if (e.image) continue
        const base = normBase(e.title)
        const k = key3(base)
        if (!k) continue
        const d = donors.get(k)
        // Lainaa VAIN jos sama sarja: toinen normalisoitu otsikko on toisen alku
        // ("craft beer garden festival" ⊂ "craft beer garden festival coolhead brew").
        // Containment estää väärät osumat kuten "stand up comedy X" ↔ "…Y".
        if (d && (base.startsWith(d.base) || d.base.startsWith(base))) e.image = d.image
      }
    }

    // Enrich events without images using venue-specific Wikipedia thumbnails only.
    // Category fallbacks are intentionally omitted — they cause every event of the
    // same category to share the same image, which looks wrong in carousels.
    const { venues: venueMap } = await fetchImagesCached()
    for (const e of events) {
      if (!e.image) {
        const fallback = getEventImage(e.location?.name, e.categories, venueMap, {})
        if (fallback) e.image = fallback
      }
    }

    // Kategorialuokitus KERRAN täällä (venue-kartta + lähdekategoriat +
    // avainsanasäännöt + globaalit vetot) — klientti ja SEO lukevat valmiin
    // tuloksen sen sijaan että jokainen laskisi omansa.
    // ISOLOITU per-tapahtuma: yksittäisen tapahtuman luokitteluvirhe EI SAA
    // kaataa koko syötettä (aiemmin poikkeus → 500 → sovellus tyhjä). Rikkinäinen
    // tapahtuma jää luokittelematta (näkyy Kaikki-syötteessä), muut säilyvät.
    for (const e of events) {
      // Dedupissa yhdistetyillä vibes on jo asetettu UNIONINA säilyttäjän ja
      // tulokkaan luokitteluista. Uudelleenlaskenta yhdistetystä tekstistä
      // voisi pudottaa kategorian (veto), joten sitä ei tehdä.
      if (e.vibes) continue
      try {
        e.vibes = classifyEvent(e)
      } catch (err) {
        e.vibes = []
        console.error('classifyEvent failed for event', e.id, err)
      }
    }
    if (perEventFailures > 0) console.warn(`[events] ${perEventFailures} tapahtumaa ohitettiin jäsennysvirheen takia`)

    return NextResponse.json({ events, hasMore, total, generatedAt: new Date().toISOString(), sources })
  } catch (err) {
    console.error('Events API error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
