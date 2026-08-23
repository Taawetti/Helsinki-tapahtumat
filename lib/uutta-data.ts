// "Uutta Helsingissä" -datan kokoaminen palvelimella. Jaettu kahdelle
// käyttäjälle: SEO-sivu /uutta-helsingissa ja /api/uutta (sovelluksen
// sisäinen Uutta-välilehti). Sama data, sama välimuisti — sivu ja välilehti
// eivät voi erota toisistaan.

import { unstable_cache } from 'next/cache'
import { buildNewInHelsinki } from './new-in-helsinki'
import type { NewInHelsinki, OpeningInput, PlaceCardInput } from './new-in-helsinki'
import type { RestaurantReason, ReasonFile } from './restaurant-reasons'
import { fetchRestaurantNews } from './restaurant-news'
import { supabase, isSupabaseConfigured } from './supabase'
import openingData from '@/data/new-openings.json'
import activityReasonData from '@/data/activity-reasons.json'
import enrichedData from '@/data/new-places-enriched.json'

/**
 * lowercase-nimi → Google-arvostelumäärä. OSM:n uutuusväitteen vartija:
 * version==1 ei takaa uutta paikkaa (mitattu: Palace ja Ihana Kahvila oli
 * vasta kartoitettu, ei vasta avattu), mutta satojen arvostelujen paikka ei
 * voi olla juuri avattu. act:-avaimet puretaan samaan karttaan.
 */
const fetchReviewCounts = unstable_cache(
  async (): Promise<[string, number][] | null> => {
    if (!isSupabaseConfigured() || !supabase) return null
    const PAGE = 1000
    const out: [string, number][] = []
    for (let page = 0; ; page++) {
      const resp = await supabase
        .from('venue_ratings')
        .select('venue_key, review_count')
        .order('venue_key')
        .range(page * PAGE, (page + 1) * PAGE - 1)
      if (resp.error || !resp.data || resp.data.length === 0) break
      for (const row of resp.data as { venue_key: string; review_count: number | null }[]) {
        const key = row.venue_key.replace(/^act:/, '').toLowerCase().trim()
        if (typeof row.review_count === 'number') out.push([key, row.review_count])
      }
      if (resp.data.length < PAGE) break
    }
    return out.length ? out : null
  },
  ['uutta-review-counts-v1'],
  { revalidate: 3600 },
)

/** Kokoaa Uutta Helsingissä -aikajanan. Uutisputken tai Supabasen kaatuminen
 *  ei kaada sivua: uutiset jäävät pois, ja ilman arvostelumääriä kortittomat
 *  OSM-rivit jätetään pois (uutuusväitettä ei voida tarkistaa — mieluummin
 *  suppeampi sivu kuin väärä "uusi paikka"). */
export async function assembleNewInHelsinki(): Promise<NewInHelsinki> {
  const reasonFile = activityReasonData as unknown as ReasonFile
  const exhibitions: RestaurantReason[] = Object.values(reasonFile.byName)
    .flat()
    .filter((r) => r.kind === 'nayttely')

  const [news, countRows] = await Promise.all([
    fetchRestaurantNews().catch(() => []),
    fetchReviewCounts().catch(() => null),
  ])

  // OSM-paikkojen Google-kortit: kuva, osoite, arvosana + tuorein
  // uutuusvartija (kortin arvostelumäärä).
  const placeCards = new Map<string, PlaceCardInput>(
    Object.entries((enrichedData as { cards?: Record<string, PlaceCardInput> }).cards ?? {}),
  )

  return buildNewInHelsinki({
    openings: (openingData.openings ?? []) as OpeningInput[],
    newPlaces: reasonFile.newPlaces ?? [],
    exhibitions,
    news,
    reviewCounts: countRows ? new Map(countRows) : undefined,
    placeCards,
    today: new Date(),
  })
}
