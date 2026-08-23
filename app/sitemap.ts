import type { MetadataRoute } from 'next'
import { VIBES, NEIGHBORHOODS } from '@/lib/types'
import { supabase, DbFestival } from '@/lib/supabase'
import { FESTIVALS_STATIC } from '@/lib/festivals-data'
import { VENUE_PAGES } from '@/lib/venue-pages'
import { LE_MAX_PAGE_SIZE } from '@/lib/linked-events'
import { helsinkiToday } from '@/lib/helsinki-time'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'
const LE_BASE = 'https://api.hel.fi/linkedevents/v1'

// Montako päivää eteenpäin sivukartalle kerätään tapahtumasivuja. Sivukartta
// uudistuu tunnin välein, joten kahdeksannen päivän tapahtumat tulevat mukaan
// itsestään huomenna — ikkunan pituus ei ratkaise kattavuutta, tuoreus ratkaisee.
const SITEMAP_DAYS = 7

async function fetchUpcomingLinkedEventIds(): Promise<string[]> {
  // PÄIVÄPALASTELU. Aiemmin tämä pyysi yhtä sivua page_size=200 ilman
  // lajittelua ja sai hiljaa 100 (LinkedEventsin kova katto). Koska `start=`
  // osuu myös vuosia käynnissä olleisiin riveihin ja oletusjärjestys nostaa ne
  // kärkeen, sivukartalle päätyi ~100 id:tä joista osa oli jo menneitä.
  //
  // Yhden aluekyselyn sivuttaminen EI sovi tähän, vaikka se tuottaisi enemmän
  // URLeja. 30 päivän Helsinki-kysely löytää mitatusti 3990 osumaa eli 40
  // sivua. Kun siitä haetaan laskevassa järjestyksessä 20 sivua, saadaan 2000
  // URLia — mutta ne kattoivat mitatusti vain päivät 3.9.–21.9., eli ikkunan
  // KAUKAISIMMAN pään. Seuraavat 12 päivää puuttuivat kokonaan, ja juuri niitä
  // päiviä käyttäjät hakevat. Enemmän URLeja väärästä päästä on huonompi
  // sivukartta kuin vähemmän URLeja oikeasta.
  //
  // Päiväkysely osuu oikeaan päähän ja on sama kuvio jota /api/events käyttää:
  // laskeva järjestys nostaa sinä päivänä alkavat kärkeen ja käynnissä olevat
  // vanhat rivit painuvat alle.
  //
  // TIETOINEN RAJAUS: yksi sivu per päivä = enintään 100 id:tä päivältä.
  // Vilkkaimpina päivinä alkavia on mitattu ~170, joten osa jää pois. Se on
  // sivukartalle hyväksyttävä — tässä ei ole kyse tapahtumien näyttämisestä
  // käyttäjälle vaan indeksoitavien URLien tarjoamisesta Googlelle, ja tulos on
  // silti moninkertainen entiseen nähden eikä sisällä vanhentuneita.
  // Helsingin päivä, ei UTC:n — klo 00–03 UTC-päivä on vielä eilinen, jolloin
  // sivukartta olisi listannut eilisen ja jättänyt viimeisen päivän pois.
  const first = helsinkiToday()
  const anchor = new Date(`${first}T12:00:00Z`).getTime()
  const days = Array.from({ length: SITEMAP_DAYS }, (_, i) =>
    new Date(anchor + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  )

  const perDay = await Promise.all(
    days.map(async (day) => {
      try {
        const url = `${LE_BASE}/event/?${new URLSearchParams({
          start: day,
          end: day,
          language: 'fi',
          division: 'helsinki',
          page: '1',
          page_size: String(LE_MAX_PAGE_SIZE),
          sort: '-start_time',
          format: 'json',
        })}`
        const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) })
        if (!res.ok) return []
        const data = (await res.json()) as { data?: { id: string; start_time?: string }[] }
        // Vain sinä päivänä ALKAVAT — käynnissä olevat vanhat rivit pois.
        return (data.data ?? [])
          .filter((e) => e.start_time?.slice(0, 10) === day)
          .map((e) => e.id)
          .filter(Boolean)
      } catch {
        return []
      }
    }),
  )

  return [...new Set(perDay.flat())]
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  // Festivaali-URL:t — staattinen lista + Supabase
  const festivalIds = new Set<string>(FESTIVALS_STATIC.map(f => f.id))
  if (supabase) {
    try {
      const { data } = await supabase.from('festivals').select('id').eq('active', true)
      if (data) (data as Pick<DbFestival, 'id'>[]).forEach(f => festivalIds.add(f.id))
    } catch { /* jatketaan staattisella listalla */ }
  }

  // Linked Events -tapahtumat seuraavalle 30 päivälle (vain Helsinki)
  const linkedEventIds = await fetchUpcomingLinkedEventIds()

  return [
    {
      url: BASE,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 1,
    },
    // Aikaperusteinen SEO-laskeutumissivut — korkean hakuvolyymin termit
    { url: `${BASE}/tapahtumat/tanaan`,     lastModified: now, changeFrequency: 'hourly' as const, priority: 0.95 },
    { url: `${BASE}/tapahtumat/viikonloppu`, lastModified: now, changeFrequency: 'daily' as const,  priority: 0.92 },
    { url: `${BASE}/tapahtumat/ilmaiset`,   lastModified: now, changeFrequency: 'daily' as const,  priority: 0.90 },
    // Pakka-sivu — ryhmien yhteinen swaippaus, korkea sitoutumisprioriteetti
    { url: `${BASE}/pakka`,    lastModified: now, changeFrequency: 'daily' as const,  priority: 0.9 },
    // Julkinen lähdeterveyden sivu + tuleva raporttisivu (URL valmiiksi indeksiin)
    { url: `${BASE}/lahteet`,  lastModified: now, changeFrequency: 'hourly' as const, priority: 0.5 },
    { url: `${BASE}/raportti`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.6 },
    // Vertikaalin laskeutumissivut — yöelämä, visat, terassit
    { url: `${BASE}/yokerhot`,  lastModified: now, changeFrequency: 'weekly' as const, priority: 0.85 },
    { url: `${BASE}/pubivisat`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.85 },
    { url: `${BASE}/terassit`,  lastModified: now, changeFrequency: 'daily' as const,  priority: 0.80 },
    { url: `${BASE}/uutta-helsingissa`, lastModified: now, changeFrequency: 'daily' as const, priority: 0.85 },
    { url: `${BASE}/saunat`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.85 },
    { url: `${BASE}/kirpputorit`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: `${BASE}/jamit`, lastModified: now, changeFrequency: 'daily' as const, priority: 0.8 },
    { url: `${BASE}/ilmaiset-museot`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.8 },
    // Keikkapaikkojen ohjelmasivut — "tavastia ohjelma" -tyyppiset haut
    ...VENUE_PAGES.map((v) => ({
      url: `${BASE}/ohjelma/${v.slug}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.82,
    })),
    // Kategoriasivut — yksi per VIBE
    ...VIBES.map((v) => ({
      url: `${BASE}/tapahtumat/${v.id}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    // Kaupunginosasivut
    ...NEIGHBORHOODS.map((n) => ({
      url: `${BASE}/tapahtumat/${n.id}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.75,
    })),
    // Festivaalisivut — indeksoidaan Googlelle nimihauilla
    ...[...festivalIds].map((id) => ({
      url: `${BASE}/tapahtuma/${id}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    })),
    // Linked Events -tapahtumasivut — yksilölliset URL:t Google rich results -hakua varten
    ...linkedEventIds.map((id) => ({
      url: `${BASE}/e/${encodeURIComponent(id)}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ]
}
