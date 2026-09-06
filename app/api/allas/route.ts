import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'
import { helsinkiISO, helsinkiToday } from '@/lib/helsinki-time'

// Kiinteä '+03:00' oli tunnin väärässä loka–maaliskuussa (EET = +02:00).
// helsinkiISO lukee offsetin kohdepäivältä.
function hkiISO(date: string, hour: number, minute: number): string {
  return helsinkiISO(Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10)), hour, minute)
}


interface AlEvent {
  id: number
  title: { rendered: string }
  link: string
  featured_media: number
  acf: {
    title?: string
    date?: string
    purchase_link?: { url?: string; title?: string }
  }
}

// KOVAKOODATTU 2026-KAUSILISTA POISTETTU 6.9.2026 (omistajan havainto):
// listassa Poets of the Fall oli merkitty päivälle 6.9., mutta oikea
// konsertti oli PERJANTAINA 4.9. (Finnair Shop: "Allas Live Poets Of The
// Fall 4.9.2026 SOLD OUT") — sovellus näytti haamukeikkaa "tänä iltana"
// kaksi päivää oikean, jo pidetyn keikan jälkeen. Lisäksi kaikki listan
// loput keikat (Pepe Willberg, Pyhimys, Karri Koira, Melo) tulivat jo
// stadissa-lähteestä oikeilla ajoilla → staattiset rivit olivat pelkkiä
// duplikaatteja eri otsikolla. Käsin ylläpidetty tapahtumalista on
// täsmälleen sitä keksittyä dataa jota tämä sovellus ei saa näyttää.
// WP-API-polku alla jää: se palvelee taas kun Allas julkaisee uuden
// kauden datan (nyt APIssa on vain 2025). Allas Liven 2026-keikat
// tulevat stadissa- ja Ticketmaster-lähteistä.
function parseDate(yyyymmdd: string): string | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null
  const y = yyyymmdd.slice(0, 4)
  const m = yyyymmdd.slice(4, 6)
  const d = yyyymmdd.slice(6, 8)
  return `${y}-${m}-${d}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  // Oletus HELSINKI-päivä: UTC-päivä on yöllä 00–03 eilinen.
  const start = searchParams.get('start') || helsinkiToday()
  const end = searchParams.get('end') || start
  const keyword = searchParams.get('keyword')?.toLowerCase() || ''

  const startTs = new Date(start).getTime()
  const endTs = new Date(end).getTime() + 24 * 60 * 60 * 1000

  const events: Event[] = []
  const seenDates = new Set<string>()

  try {
    // Fetch all al-events from WP API (max 100 — covers ~30–50 events)
    const res = await fetch(
      'https://www.allaspool.fi/wp-json/wp/v2/al-events?per_page=100&_fields=id,title,link,acf,featured_media',
      {
        next: { revalidate: 3600, tags: ['events'] },
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
        signal: AbortSignal.timeout(8000),
      }
    )

    if (res.ok) {
      const raw: AlEvent[] = await res.json()

      // Deduplicate — Finnish and English versions appear as separate WP posts
      const wpSeen = new Set<string>()
      const unique: AlEvent[] = []
      for (const e of raw) {
        const title = (e.acf?.title || e.title.rendered).trim()
        const date = e.acf?.date || ''
        const key = `${title.toLowerCase()}|${date}`
        if (!wpSeen.has(key)) { wpSeen.add(key); unique.push(e) }
      }

      // Filter by requested date range
      const inRange = unique.filter((e) => {
        const d = parseDate(e.acf?.date || '')
        if (!d) return false
        const ts = new Date(d).getTime()
        return ts >= startTs && ts <= endTs
      })

      // Batch-fetch images for events that have featured_media
      const mediaIds = [...new Set(inRange.map((e) => e.featured_media).filter(Boolean))]
      const imageMap = new Map<number, string>()
      if (mediaIds.length > 0) {
        try {
          const imgRes = await fetch(
            `https://www.allaspool.fi/wp-json/wp/v2/media?include=${mediaIds.join(',')}&_fields=id,source_url&per_page=100`,
            {
              next: { revalidate: 86400 },
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Helsinki-Tapahtumat/1.0)' },
              signal: AbortSignal.timeout(6000),
            }
          )
          if (imgRes.ok) {
            const imgs: { id: number; source_url: string }[] = await imgRes.json()
            for (const img of imgs) imageMap.set(img.id, img.source_url)
          }
        } catch {
          // images optional — proceed without
        }
      }

      for (const e of inRange) {
        const title = (e.acf?.title || e.title.rendered).trim()
        const date = parseDate(e.acf?.date || '')
        if (!title || !date) continue
        if (!title) continue

        seenDates.add(date)
        events.push({
          id: `allas-${e.id}`,
          title,
          shortDescription: 'Allas Sea Pool — Helsinki',
          description: '',
          startTime: hkiISO(date, 19, 0),
          startTimeApprox: true, // vain päivä skrapattu — klo 19 on oletus
          endTime: null,
          location: {
            name: 'Allas Sea Pool',
            streetAddress: 'Katajanokanlaituri 2a',
            city: 'Helsinki',
            lat: 60.1674,
            lon: 24.9565,
          },
          image: e.featured_media ? (imageMap.get(e.featured_media) ?? null) : null,
          isFree: false,
          price: null,
          ticketUrl: e.acf?.purchase_link?.url || e.link,
          infoUrl: e.link,
          categories: ['Musiikki', 'Keikka', 'Live-musiikki'],
          source: 'linked-events',
        })
      }
    }
  } catch {
    // WP API alhaalla — palautetaan tyhjä; Allas Liven keikat tulevat joka
    // tapauksessa stadissa- ja Ticketmaster-lähteistä.
  }

  return NextResponse.json({ events })
}
