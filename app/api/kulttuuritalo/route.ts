import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { scrapeMeta } from '@/lib/scrape-meta'
import { helsinkiISO } from '@/lib/helsinki-time'

// Kiinteä '+03:00' oli tunnin väärässä loka–maaliskuussa (EET = +02:00).
// helsinkiISO lukee offsetin kohdepäivältä.
function hkiISO(date: string, hour: number, minute: number): string {
  return helsinkiISO(Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10)), hour, minute)
}


const VENUE = {
  name: 'Kulttuuritalo',
  address: 'Sturenkatu 4',
  city: 'Helsinki',
  lat: 60.1938,
  lon: 24.9463,
  url: 'https://kulttuuritalo.fi',
}

// "25.07.2026" → "2026-07-25"
function parseDDMMYYYY(s: string): string {
  const m = s.match(/(\d{1,2})\.(\d{2})\.(\d{4})/)
  if (!m) return ''
  const day = parseInt(m[1])
  const month = parseInt(m[2])
  const year = parseInt(m[3])
  if (day < 1 || day > 31 || month < 1 || month > 12) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function scrape(): Promise<{ title: string; date: string; ticketUrl: string }[]> {
  const res = await fetch('https://kulttuuritalo.fi/tapahtumat/', {
    next: { revalidate: 3600, tags: ['events'] },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)

  const html = await res.text()
  const results: { title: string; date: string; ticketUrl: string }[] = []

  // Numeeriset (&#8211; &#x2013;) ja tavallisimmat nimetyt entiteetit.
  const NAMED: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘',
    ldquo: '“', rdquo: '”', auml: 'ä', ouml: 'ö', Auml: 'Ä', Ouml: 'Ö',
  }
  const decodeEntities = (s: string): string =>
    s
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      // &amp; puretaan VIIMEISENÄ, jottei "&amp;#8211;" muuttuisi ensin
      // muotoon "&#8211;" ja siitä edelleen viivaksi — kaksinkertainen purku
      // tekisi datasta eri kuin lähteessä.
      .replace(/&([a-zA-Z]+);/g, (m0, name) => (name in NAMED && name !== 'amp' ? NAMED[name] : m0))
      .replace(/&amp;/g, '&')

  // Each event: <a ... href="https://kulttuuritalo.fi/tapahtuma/[slug]/">...<h3>Title</h3>...DD.MM.YYYY...</a>
  //
  // HREF EI OLE ENSIMMÄINEN ATTRIBUUTTI. Tämä regex oli aiemmin muodossa
  // /<a\s+href="…/ eli se vaati hrefin heti <a:n perään. Sivun todellinen
  // markup on:
  //     <a class="poster-background background-coal " href="https://kulttuuritalo.fi/tapahtuma/…"
  // eli class tulee ensin — joten regex ei osunut YHTEENKÄÄN tapahtumaan ja
  // reitti palautti 0 (meta.live=0, ei virhettä, joten se näytti "sivu vastasi
  // mutta ohjelmaa ei ole" -tilanteelta eikä rikkinäiseltä parserilta).
  // Nyt attribuutit hrefin edellä sallitaan: [^>]*? ennen href-osumaa.
  const linkRe = /<a\s[^>]*?href="(https?:\/\/kulttuuritalo\.fi\/tapahtuma\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1]
    const inner = m[2]

    const titleM = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)
    if (!titleM) continue
    // Entiteetit puretaan KAIKKI, ei vain &amp;. WordPress tuottaa otsikoihin
    // numeerisia entiteettejä (mitattu: "Ismo Leikola &#8211; Omasta mielestä"
    // eli ajatusviiva), ja aiempi pelkkä &amp;-korvaus jätti ne raakana —
    // React escapoi ne uudelleen, joten kortilla olisi näkynyt "&#8211;".
    const title = decodeEntities(titleM[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    if (!title || title.length < 2) continue

    const dateM = inner.match(/(\d{1,2}\.\d{2}\.\d{4})/)
    if (!dateM) continue
    const date = parseDDMMYYYY(dateM[1])
    if (!date) continue

    results.push({ title, date, ticketUrl: href })
  }
  return results
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start
  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 86400000

  let lineup: { title: string; date: string; ticketUrl: string }[] = []
  let scrapeError: string | null = null
  try {
    lineup = await scrape()
  } catch (err) {
    scrapeError = String(err)
    console.error('[kulttuuritalo] scrape failed:', err)
  }
  const events: Event[] = []
  const seen = new Set<string>()

  for (const e of lineup) {
    const ts = new Date(e.date).getTime()
    if (ts < startTs || ts >= endTs) continue
    const key = `${e.date}|${e.title.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    events.push({
      id: `kulttuuritalo-${e.date.replace(/-/g, '')}-${e.title.slice(0, 20).replace(/\W+/g, '-').toLowerCase()}`,
      title: e.title,
      shortDescription: `Kulttuuritalo – ${VENUE.address}, Helsinki`,
      description: '',
      startTime: hkiISO(e.date, 19, 0),
      startTimeApprox: true, // vain päivä skrapattu — klo 19 on oletus
      endTime: null,
      location: { name: VENUE.name, streetAddress: VENUE.address, city: VENUE.city, lat: VENUE.lat, lon: VENUE.lon },
      image: null,
      isFree: false,
      price: null,
      ticketUrl: e.ticketUrl,
      infoUrl: e.ticketUrl,
      categories: ['Musiikki', 'Keikka', 'Konsertti'],
      source: 'linked-events',
    })
  }

  return NextResponse.json({ events, ...scrapeMeta(lineup.length, scrapeError) })
}
