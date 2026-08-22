import { NextRequest, NextResponse } from 'next/server'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export const revalidate = 3600

// On-demand rich Google profile for ONE restaurant, read when its detail card is
// opened. Mirrors /api/activity-google but keys the row by the bare venue name
// (restaurants have no `act:` prefix) and also surfaces the real reservation
// link (book_online_url). Keeps the /api/restaurants list response lean — the
// heavy fields (attributes, rating distribution, reservation link) load on tap.
export async function GET(req: NextRequest) {
  const key = (req.nextUrl.searchParams.get('key') || '').toLowerCase().trim()
  if (!key) return NextResponse.json({ google: null })
  if (!isSupabaseConfigured() || !supabase) return NextResponse.json({ google: null })

  const { data, error } = await supabase
    .from('venue_ratings')
    .select('google_raw, review_count, google_rating')
    .eq('venue_key', key)
    .maybeSingle()

  if (error || !data?.google_raw) return NextResponse.json({ google: null })

  const g = data.google_raw as Record<string, unknown>
  const attrs = (g.attributes ?? null) as { available_attributes?: Record<string, string[]> } | null

  // DataForSEO price_level on enum ('inexpensive'…'very_expensive') → €-asteikko
  const PRICE_EUR: Record<string, string> = { inexpensive: '€', moderate: '€€', expensive: '€€€', very_expensive: '€€€€' }
  const pl = (g.price_level ?? null) as string | null

  const bookUrl = (g.book_online_url ?? null) as string | null
  // Google Maps -LISTAUKSEN url rakennetaan cid:stä (items-tason kenttä,
  // tallessa google_raw:ssa). HUOM: g.url on ravintolan OMA nettisivu (= sama
  // kuin Nettisivu-nappi), EI Maps-listaus, joten sitä ei käytetä tähän.
  const cid = g.cid != null ? String(g.cid) : null
  const mapsUrl = cid && /^\d+$/.test(cid) ? `https://www.google.com/maps?cid=${cid}` : null

  // popular_times → per-viikonpäivä tuntitaulukko [{hour, index 0-100}] (client
  // laskee "ruuhka nyt" oman kellon mukaan). place_topics jätetty pois: DataForSEO
  // ei palauta sitä Helsingin kohteille (0 osumaa koko datassa).
  const ptDays = (g.popular_times as { popular_times_by_days?: Record<string, Array<{ time?: { hour?: number }; popular_index?: number }>> } | null)?.popular_times_by_days
  let popularTimes: Record<string, { hour: number; index: number }[]> | null = null
  if (ptDays && typeof ptDays === 'object') {
    const out: Record<string, { hour: number; index: number }[]> = {}
    for (const [day, arr] of Object.entries(ptDays)) {
      if (!Array.isArray(arr)) continue
      const hours = arr
        .map((e) => ({ hour: typeof e?.time?.hour === 'number' ? e.time.hour : -1, index: typeof e?.popular_index === 'number' ? e.popular_index : 0 }))
        .filter((e) => e.hour >= 0)
      if (hours.length) out[day.toLowerCase()] = hours
    }
    if (Object.keys(out).length) popularTimes = out
  }

  // people_also_search → "vastaavat paikat" (nimi + arvosana), top 6
  const pas = g.people_also_search
  const peopleAlsoSearch = Array.isArray(pas)
    ? pas
        .map((p) => {
          const o = p as { title?: unknown; rating?: { value?: number; votes_count?: number } }
          return {
            title: typeof o?.title === 'string' ? o.title : null,
            rating: typeof o?.rating?.value === 'number' ? o.rating.value : null,
            reviewCount: typeof o?.rating?.votes_count === 'number' ? o.rating.votes_count : null,
          }
        })
        .filter((p): p is { title: string; rating: number | null; reviewCount: number | null } => !!p.title)
        .slice(0, 6)
    : null

  // ── RUOKALISTA ────────────────────────────────────────────────────────────
  // google_raw.services on annoslista: { title, snippet, category, price }.
  // Mitattu 202 paikkaa, 5858 annosta, 5244 hinnalla. Tämä on koko datajoukon
  // arvokkain osa — "mitä täällä voi syödä ja mitä se maksaa" on juuri se
  // kysymys johon Google Maps vastaa mobiilissa huonoiten — eikä siihen ole
  // viitattu koodissa kertaakaan.
  //
  // HINTA TARKISTETAAN, EI LUOTETA. Datassa on rikkinäisiä rivejä: yhdellä
  // ravintolalla nuudelikeitto on "1 824,00 €" (18 riviä 5244:stä, 0,34 %).
  // Väärä hinta on käyttäjälle pahempi kuin puuttuva, joten järjettömästä
  // hinnasta pudotetaan HINTA mutta annos jää — ravintolan tarjonta on silti
  // oikeaa tietoa. Alaraja 0,50 € päästää läpi aidot pizzatäytteet (0,60 €)
  // mutta pudottaa "0,00 €" -rivit, jotka eivät tarkoita ilmaista.
  const MENU_MAX_ITEMS = 8
  const PRICE_MIN_EUR = 0.5
  const PRICE_MAX_EUR = 200

  interface RawService {
    title?: unknown
    snippet?: unknown
    category?: unknown
    price?: { current?: unknown; currency?: unknown; displayed_price?: unknown } | null
  }
  // `category` on datassa mutta sitä ei projisoida: sitä ei renderöidä, ja
  // keräämättä jättäminen on koko tämän muutoksen periaate.
  const rawServices = Array.isArray(g.services) ? (g.services as RawService[]) : []
  const menu = rawServices
    .map((s) => {
      const title = typeof s?.title === 'string' ? s.title.trim() : ''
      if (!title) return null
      const p = s?.price
      const cur = typeof p?.current === 'number' && Number.isFinite(p.current) ? p.current : null
      const currency = typeof p?.currency === 'string' ? p.currency : 'EUR'
      const sane = cur != null && currency === 'EUR' && cur >= PRICE_MIN_EUR && cur <= PRICE_MAX_EUR
      const displayed = typeof p?.displayed_price === 'string' ? p.displayed_price.trim() : ''
      return {
        title: title.slice(0, 80),
        // displayed_price säilyttää hintahaarukat ("12–15 €"), joten sitä
        // suositaan — mutta vasta kun numeerinen arvo on läpäissyt tarkistuksen.
        price: sane ? (displayed || `${cur.toFixed(2).replace('.', ',')} €`) : null,
        description: typeof s?.snippet === 'string' && s.snippet.trim() ? s.snippet.trim().slice(0, 120) : null,
      }
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .slice(0, MENU_MAX_ITEMS)

  // Ruokalistalinkki (mitattu 566 paikalla) — "koko lista" kun näytämme 8.
  const links = Array.isArray(g.local_business_links)
    ? (g.local_business_links as { url?: unknown; type?: unknown }[])
    : []
  const menuLink = links.find((l) => l?.type === 'menu' && typeof l?.url === 'string' && /^https?:\/\//i.test(l.url as string))
  const menuUrl = (menuLink?.url as string | undefined) ?? null

  return NextResponse.json({
    google: {
      menu: menu.length > 0 ? menu : null,
      menuUrl,
      menuTotal: rawServices.length,
      rating: (g.rating as { value?: number })?.value ?? data.google_rating ?? null,
      reviewCount: (g.rating as { votes_count?: number })?.votes_count ?? data.review_count ?? null,
      ratingDistribution: (g.rating_distribution ?? null) as Record<string, number> | null,
      priceLevel: pl && PRICE_EUR[pl] ? PRICE_EUR[pl] : null,
      // available_attributes is grouped { offerings:[...], service_options:[...], ... }
      attributes: attrs?.available_attributes ?? null,
      phone: (g.phone ?? null) as string | null,
      mapsUrl,
      // Todellinen varauslinkki (Google "Book online") — voittaa heuristisen
      bookOnlineUrl: bookUrl && /^https?:\/\//i.test(bookUrl) ? bookUrl : null,
      popularTimes,
      peopleAlsoSearch: peopleAlsoSearch && peopleAlsoSearch.length ? peopleAlsoSearch : null,
      totalPhotos: typeof g.total_photos === 'number' ? g.total_photos : null,
      isClaimed: g.is_claimed === true,
    },
  })
}
