import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const EVENTIM_BASE = 'https://public-api.eventim.com/websearch/search/api/exploration/v1/products'

// Itsensä tunnistava User-Agent. TÄMÄ EI OLE TODISTETTU KORJAUS — se on
// hyvää käytöstä, ja syy on kirjattava rehellisesti:
//
// Kun top=100 → 400 oli korjattu, reitti toimi kehityskoneelta (49 tapahtumaa)
// mutta tuotannossa se palauttaa yhä NOLLAN. Epäilin Eventimin bottisuojausta:
// curlilla testattuna tyhjä ja selaimeksi tekeytyvä UA saivat vakaasti 403:n.
// Se päätelmä oli VIRHEELLINEN: Node lähettää oletuksena "User-Agent: node",
// ja Nodella ajettuna sama kysely saa 200:n sekä ilman UA:ta että sen kanssa.
// Akamai tunnistaa koko asiakkaan (TLS-sormenjälki, otsakejärjestys), joten
// curl+väärennetty-UA ei mittaa samaa asiaa kuin Node.
//
// Mitä siis TIEDETÄÄN: kysely toimii tältä koneelta, ei Vercelistä. Todennäköisin
// selitys on konesalin IP-avaruuden esto — mitä ei voi todentaa ilman pääsyä
// tuotannon lokeihin. Yhdessä hostin robots.txt:n kanssa
// (`User-agent: * Disallow: /`) se on selvä viesti: tätä liikennettä ei haluta.
// Oikea ratkaisu on joko kumppanipääsy Eventimiltä tai lähteen poisto — ei
// suojauksen kiertäminen.
//
// UA jätetään tähän siksi, että "node" ei kerro kenellekään kuka soittaa; tämä
// kertoo, ja antaa Eventimille mahdollisuuden estää tai tavoittaa meidät
// nimenomaisesti. Sama muoto kuin festival-watch-cronissa.
const UA = 'Mita-tanaan/1.0 (+https://helsinki-tapahtumat.vercel.app)'

interface EventimProduct {
  name: string
  description?: string
  imageUrl?: string
  link: string
  price?: number
  currency?: string
  inStock?: boolean
  status?: string
  productId: string
  categories?: { name: string; parentCategory?: { name: string } }[]
  typeAttributes?: {
    liveEntertainment?: {
      startDate?: string
      endDate?: string
      location?: {
        name?: string
        city?: string
        postalCode?: string
        geoLocation?: { latitude: number; longitude: number }
      }
    }
  }
}

function normalize(p: EventimProduct, today: string): Event | null {
  const le = p.typeAttributes?.liveEntertainment
  if (!le?.startDate) return null

  const startTime = le.startDate
  const startDate = startTime.slice(0, 10)
  if (startDate < today) return null

  const venueName = le.location?.name || ''
  const city = le.location?.city || 'Helsinki'
  const lat = le.location?.geoLocation?.latitude
  const lon = le.location?.geoLocation?.longitude

  const isFree = p.price === 0
  const priceStr = p.price && p.price > 0
    ? `${p.price.toFixed(2).replace('.', ',')} €`
    : null

  const categories = (p.categories || [])
    .filter(c => !c.parentCategory)
    .map(c => c.name)
    .filter(Boolean)
    .slice(0, 3)

  return {
    id: `lippu-${p.productId}`,
    title: p.name,
    shortDescription: p.description || '',
    description: p.description || '',
    startTime,
    endTime: le.endDate || null,
    location: {
      name: venueName,
      streetAddress: '',
      city,
      ...(lat !== undefined && lon !== undefined ? { lat, lon } : {}),
    },
    image: p.imageUrl || null,
    isFree,
    price: priceStr,
    ticketUrl: p.link,
    infoUrl: p.link,
    categories,
    source: 'lippu',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start
  const today = new Date().toISOString().slice(0, 10)

  // Eventimin `top` on kovarajattu 50:een: 51 tai enemmän vastaa HTTP 400
  // "Invalid parameter supplied". Reitti pyysi 100, joten JOKA kysely palautti
  // 400 — ja koska virhe niellään alla (`if (!res.ok) return { events: [] }`),
  // lippu.fi palautti nollan tapahtumaa aina, ilman että mikään kertoi siitä.
  // Mitattu 22.8.2026: top=50 → HTTP 200, top=51 → HTTP 400.
  const TOP = 50

  // HAKUMÄÄRÄÄ EI KASVATETA — ja se on tietoinen valinta, ei tekninen rajoite.
  //
  // Endpointissa on toimiva sivutus, mutta VAIN jos `top` jätetään pois: `page`
  // ohitetaan hiljaa aina kun `top` on mukana (mitattu: top=50 &&
  // page=1|2|3 palauttaa samat 50 productId:tä; ilman top:ia sivut 1–3 ovat
  // täysin erillisiä, 20 riviä kukin, totalPages=12, totalResults=933).
  // Sivuttamalla saisi siis ~931 tapahtumaa 60 päivän ikkunaan.
  //
  // SITÄ EI TEHDÄ, koska public-api.eventim.com/robots.txt sanoo:
  //     User-agent: Googlebot   Allow: /websearch/
  //     User-agent: *           Disallow: /
  // Eli kaikki muut kuin Googlebot on kielletty koko hostilta. Tämä reitti on
  // hakenut tästä endpointista jo pitkään yhdellä kyselyllä, joten se osa on
  // olemassa oleva integraatiovalinta — mutta yhden kyselyn kasvattaminen
  // kahdeksitoista (tai 30 päiväpalaseksi) on eri asia, eikä sellaista laajen-
  // nusta pidä tehdä suoran robots-kiellon yli ilman omistajan päätöstä.
  // Jos laajempi kate halutaan, oikea järjestys on hankkia Eventimiltä
  // kumppanipääsy ja sivuttaa sitten — ei ohittaa kieltoa hiljaa.
  const params = new URLSearchParams({
    webId: 'web__lippu-fi',
    language: 'fi',
    retail_partner: 'LPU',
    city_names: 'Helsinki',
    page: '1',
    top: String(TOP),
    date_from: start,
    date_to: end,
  })

  try {
    const res = await fetch(`${EVENTIM_BASE}?${params}`, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json', 'User-Agent': UA },
    })

    // Virhe EI jää enää näkymättömäksi. Juuri tämä rivi piti lähteen nollassa:
    // `top=100` tuotti HTTP 400:n, joka muuttui hiljaa tyhjäksi listaksi, eikä
    // mikään erottanut sitä aidosti tyhjästä tuloksesta. Nyt status menee
    // lokiin, ja pitkittyneen nollan huomaa /api/cron/source-health.
    if (!res.ok) {
      console.error(`Lippu.fi: HTTP ${res.status} — 0 tapahtumaa (tarkista parametrit)`)
      return NextResponse.json({ events: [] })
    }

    const data = (await res.json()) as { products?: EventimProduct[] }
    const products = data.products ?? []

    const seen = new Set<string>()
    const events: Event[] = []
    for (const p of products) {
      if (!p?.productId || seen.has(p.productId)) continue
      seen.add(p.productId)
      const ev = normalize(p, today)
      if (ev) events.push(ev)
    }

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Lippu.fi API error:', err)
    return NextResponse.json({ events: [] })
  }
}
