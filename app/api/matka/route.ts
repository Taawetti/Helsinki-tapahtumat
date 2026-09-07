// Siirtymän kulkutapa-ajat: kävely, julkiset ja pyörä Digitransitista (HSL:n
// oma reititysmoottori — sama jota Reittiopas käyttää, reaaliaikatietoineen).
// Avain kulkee VAIN palvelimella. Haku tehdään käyttäjän toimesta (siirtymän
// napautus suunnitelmassa), ja tulokset välimuistetaan — kutsumäärät pysyvät
// pieninä. Autolle ei ole lähdettä (Digitransit ei reititä autoa) — UI antaa
// sille Google Maps -linkin.
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

interface MatkaAjat {
  kavely: number | null
  julkinen: number | null
  pyora: number | null
}

// Prosessikohtainen välimuisti: sama väli + sama vartin aikalohko → ei uutta
// hakua. Serverless-instansseja voi olla monta, joten tämä on optimointi,
// ei takuu — riittää hyvin tähän käyttöön.
const VALIMUISTI = new Map<string, { ajat: MatkaAjat; ts: number }>()
const TTL_MS = 15 * 60_000
const MAX_RIVIT = 500

/** "lat,lon" → [lat, lon] pk-seuturajauksella (sama alue kuin geokoodauksessa). */
function kelpoKoord(raaka: string | null): [number, number] | null {
  const m = raaka?.match(/^(-?\d{1,2}(?:\.\d{1,7})?),(-?\d{1,3}(?:\.\d{1,7})?)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lon = Number(m[2])
  if (lat < 59.8 || lat > 60.6 || lon < 24.2 || lon > 25.7) return null
  return [lat, lon]
}

function minuutit(osa: unknown): number | null {
  const it = (osa as { itineraries?: { duration?: number }[] } | null)?.itineraries
  const kesto = it?.[0]?.duration
  return typeof kesto === 'number' && Number.isFinite(kesto) ? Math.max(1, Math.round(kesto / 60)) : null
}

export async function GET(req: NextRequest) {
  const avain = process.env.DIGITRANSIT_KEY
  if (!avain) return NextResponse.json({ error: 'Reittihaku ei ole käytössä' }, { status: 503 })
  if (!rateLimit(`matka:${clientIp(req)}`, 60, 60 * 60_000)) {
    return NextResponse.json({ error: 'Liian monta hakua. Yritä myöhemmin.' }, { status: 429 })
  }

  const p = req.nextUrl.searchParams
  const from = kelpoKoord(p.get('from'))
  const to = kelpoKoord(p.get('to'))
  if (!from || !to) return NextResponse.json({ error: 'Kelvottomat koordinaatit' }, { status: 400 })
  // Julkisten aika riippuu lähtöhetkestä — päivä ja kellonaika suunnitelmasta.
  const paiva = /^\d{4}-\d{2}-\d{2}$/.test(p.get('paiva') ?? '') ? p.get('paiva')! : null
  const klo = /^\d{2}:\d{2}$/.test(p.get('klo') ?? '') ? p.get('klo')! : null

  // Koordinaatit 4 desimaalilla (~11 m) ja lähtöaika vartin lohkoina —
  // sama siirtymä ei aiheuta uutta hakua pieniin eroihin.
  const vartti = klo ? String(Math.floor(Number(klo.slice(3, 5)) / 15) * 15).padStart(2, '0') : ''
  const lohko = paiva && klo ? `${paiva}T${klo.slice(0, 2)}:${vartti}` : 'nyt'
  const cacheAvain = `${from.map((n) => n.toFixed(4))}→${to.map((n) => n.toFixed(4))}@${lohko}`
  const osuma = VALIMUISTI.get(cacheAvain)
  if (osuma && Date.now() - osuma.ts < TTL_MS) {
    return NextResponse.json(osuma.ajat, { headers: { 'x-valimuisti': 'osuma' } })
  }

  const ft = `from: {lat: ${from[0]}, lon: ${from[1]}}, to: {lat: ${to[0]}, lon: ${to[1]}}, numItineraries: 1`
  const aika = paiva && klo ? `, date: "${paiva}", time: "${klo}:00"` : ''
  // Yksi GraphQL-kutsu, kolme aliasta. Kävely ja pyörä eivät riipu kellon-
  // ajasta → ilman aikaa, jotta välimuisti osuu paremmin muissa lohkoissa.
  const query = `{
    kavely: plan(${ft}, transportModes: [{mode: WALK}]) { itineraries { duration } }
    julkinen: plan(${ft}, transportModes: [{mode: TRANSIT}, {mode: WALK}]${aika}) { itineraries { duration } }
    pyora: plan(${ft}, transportModes: [{mode: BICYCLE}]) { itineraries { duration } }
  }`

  try {
    const res = await fetch('https://api.digitransit.fi/routing/v2/hsl/gtfs/v1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'digitransit-subscription-key': avain },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return NextResponse.json({ error: 'Reittihaku epäonnistui' }, { status: 502 })
    const data = (await res.json()) as { data?: Record<string, unknown> }
    const ajat: MatkaAjat = {
      kavely: minuutit(data.data?.kavely),
      julkinen: minuutit(data.data?.julkinen),
      pyora: minuutit(data.data?.pyora),
    }
    if (VALIMUISTI.size >= MAX_RIVIT) VALIMUISTI.clear()
    VALIMUISTI.set(cacheAvain, { ajat, ts: Date.now() })
    return NextResponse.json(ajat)
  } catch {
    return NextResponse.json({ error: 'Reittihaku epäonnistui' }, { status: 502 })
  }
}
