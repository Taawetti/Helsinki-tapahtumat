import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { helsinkiDateOf } from '@/lib/helsinki-time'

// Kide.app — opiskelijatapahtumat, klubi-illat ja ruohonjuuritason menot.
//
// TÄMÄ REITTI PALAUTTI NOLLAN. Kolme erillistä vikaa, kaikki omassa koodissa;
// rajapinta on koko ajan ollut terve ja ilman tunnistautumista.
//
// 1) VÄÄRÄ PALVELIN. Haku meni osoitteeseen `kide.app/api/products`, mutta
//    kide.app on AngularJS-selainsovellus, ei rajapinta. Sen catch-all
//    palauttaa /api/*-poluille sovelluskuoren: HTTP 200, content-type
//    text/html, ~360 kB "<!doctype html>". Koska status on 200, tarkistus
//    `if (!res.ok)` päästi sen läpi, ja `res.json()` heitti "<"-merkkiin —
//    minkä try/catch nielaisi tyhjäksi listaksi. 200-joka-on-HTML on juuri se
//    muoto jota reitti ei voinut nähdä. Oikea osoite on `api.kide.app`.
//
// 2) VÄÄRÄT KENTTÄNIMET. Vanha tyyppi odotti `dateStart`, `place.name` ja
//    `company.name`. Todellisessa vastauksessa aika on `dateActualFrom`, ja
//    `place` sekä `companyName` ovat MERKKIJONOJA, eivät olioita. Vaikka
//    palvelin olisi korjattu, tulos olisi ollut nimettömiä tapahtumia ilman
//    aikaa.
//
// 3) VÄÄRÄ source-ARVO. Reitti merkitsi tapahtumat `source: 'linked-events'`.
//    Se ei ole kosmeettista: PosterCard päättää sen perusteella, saako kortti
//    crawlattavan sisäisen linkin `/e/<id>` (components/PosterCard.tsx:76,
//    kommentti "Crawlable href vain id:lle, jotka /e/[id] oikeasti ratkaisee").
//    Kide-id on `kide-<uuid>`, jota /e/[id] hakee LinkedEventsistä eikä löydä
//    → jokainen kide-kortti olisi tuottanut 404:n. Vika ei ollut näkynyt vain
//    siksi, että lähde palautti nollan. Nyt source on 'kide', jolloin kortti
//    avaa paneelin ja ohjaa lippulinkkiin.
//
// Poistetut strategiat: aiemmat varapolut etsivät `__NEXT_DATA__`-lohkoa ja
// `href="/events/…"`-linkkejä HTML:stä. Kumpikaan ei voi toimia — kide.app on
// AngularJS (0 osumaa __NEXT_DATA__:aan) ja sen kuoressa ei ole yhtään
// sisältölinkkiä (kaikki hrefit ovat SVG-viittauksia kuten "#o-cart"). Ne
// eivät tuoneet turvaa vaan peittivät vian: reitti näytti siltä kuin sillä
// olisi kolme yritystä, joista yksikään ei voinut onnistua.

const KIDE_API = 'https://api.kide.app/api/products'
const KIDE_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' }

// productType erottaa tapahtumat kauppatavarasta: 1 = tapahtuma, 2 = tuote.
// Mitattu 60 pv:n ikkunasta 118 kpl tyyppiä 1 ja 2 kpl tyyppiä 2 — jälkimmäiset
// olivat "Hjördis -lippis" ja "HUMAKO-Vyö", eli lippalakki ja vyö.
const PRODUCT_TYPE_EVENT = 1

// place on vapaata tekstiä ja tyhjä arvo tulee kirjaimellisena merkkijonona.
const EMPTY_PLACE = '{empty}'

const STUDENT_KEYWORDS = ['yliopisto', 'opiskelij', 'ainejärjestö', 'kilta', 'teekkar', 'hyyryläinen', 'hyy ', 'tky', 'aky', 'oty', 'osy', 'fuksi', 'appro', 'sitsit', 'sitsi']

function isStudentRelated(text: string): boolean {
  const lower = text.toLowerCase()
  return STUDENT_KEYWORDS.some((kw) => lower.includes(kw))
}

function buildCategories(title: string, venue: string): string[] {
  const cats: string[] = ['Yöelämä', 'Klubi']
  if (isStudentRelated(title) || isStudentRelated(venue)) cats.push('Opiskelijat')
  return cats
}

interface KideProduct {
  id?: string
  name?: string
  place?: string | null
  companyName?: string | null
  dateActualFrom?: string | null
  dateActualUntil?: string | null
  productType?: number
  minPrice?: { eur?: number } | null
  hasFreeInventoryItems?: boolean
}

/** minPrice tulee SENTTEINÄ: mitattu {"eur":800} = 8,00 € klubi-illalle. */
function formatPrice(minPrice: KideProduct['minPrice']): string | null {
  const cents = minPrice?.eur
  if (typeof cents !== 'number' || cents <= 0) return null
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`
}

function normalize(p: KideProduct): Event | null {
  const id = p.id
  const title = p.name?.trim()
  const startTime = p.dateActualFrom
  if (!id || !title || !startTime) return null

  const rawPlace = (p.place ?? '').trim()
  const venue = rawPlace && rawPlace !== EMPTY_PLACE ? rawPlace : (p.companyName ?? '').trim()
  const url = `https://kide.app/events/${id}`
  const isFree = p.hasFreeInventoryItems === true

  return {
    id: `kide-${id}`,
    title,
    shortDescription: venue ? `Kide.app · ${venue}` : 'Kide.app',
    description: '',
    // dateActualFrom sisältää AINA vyöhykkeen (mitattu 120/120 riviä muodossa
    // "…+03:00"), joten aikaleimaa ei tarvitse normalisoida erikseen.
    startTime,
    endTime: p.dateActualUntil ?? null,
    location: { name: venue || 'Helsinki', streetAddress: '', city: 'Helsinki' },
    image: null,
    isFree,
    price: isFree ? null : formatPrice(p.minPrice),
    ticketUrl: url,
    infoUrl: url,
    categories: buildCategories(title, venue),
    source: 'kide',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().split('T')[0]
  const end = searchParams.get('end') || start

  try {
    // `city` on PAKOLLINEN (ilman sitä HTTP 400) ja se on luotettava
    // palvelinpuolen suodatin: myös rivi jonka vapaa `place`-teksti oli "Oulu"
    // osoittautui detail-haussa helsinkiläiseksi (Original Sokos Hotel).
    // `size`-parametri sen sijaan OHITETAAN — arvoilla 5, 50, 100, 500 ja 1000
    // tulee joka kerta sama 471 rivin lista, eli vastaus on aina täysi.
    const res = await fetch(`${KIDE_API}?city=helsinki`, {
      next: { revalidate: 3600, tags: ['events'] },
      headers: KIDE_HEADERS,
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      console.error(`Kide.app: HTTP ${res.status} — 0 tapahtumaa`)
      return NextResponse.json({ events: [] })
    }

    // Sisältötyyppi tarkistetaan ERIKSEEN. Juuri tämä puuttui: väärä palvelin
    // vastasi 200:lla ja HTML:llä, ja pelkkä res.json() muuttui hiljaiseksi
    // nollaksi. Nyt väärä tyyppi on lokissa eikä tyhjä lista.
    const ctype = res.headers.get('content-type') ?? ''
    if (!ctype.includes('json')) {
      console.error(`Kide.app: odotettiin JSONia, saatiin "${ctype}" — 0 tapahtumaa`)
      return NextResponse.json({ events: [] })
    }

    const data = (await res.json()) as { model?: KideProduct[] }
    const products = Array.isArray(data?.model) ? data.model : []

    const events: Event[] = []
    const seen = new Set<string>()
    for (const p of products) {
      if (p?.productType !== PRODUCT_TYPE_EVENT) continue
      const ev = normalize(p)
      if (!ev || seen.has(ev.id)) continue
      // Päivä luetaan HELSINGIN kalenterista: klubi-ilta alkaa usein 23.15 ja
      // päättyy aamuyöllä, joten raaka UTC-etuliite osuisi väärään päivään.
      const day = helsinkiDateOf(ev.startTime)
      if (day < start || day > end) continue
      seen.add(ev.id)
      events.push(ev)
    }

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Kide.app error:', err)
    return NextResponse.json({ events: [] })
  }
}
