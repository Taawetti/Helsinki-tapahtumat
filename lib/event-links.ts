// Mihin tapahtumasta saa linkittää ja mihin ei.
//
// 1) OMA TAPAHTUMASIVU: /e/[id] osaa ratkaista vain tietyt id-muodot
//    (app/e/[id]/page.tsx getEventData). Aiemmin tätä pääteltiin source-
//    kentästä, mutta stadissa-lähde merkitsee tapahtumansa 'linked-events'-
//    lähteeksi → /e/stadissa-116290 oli 404 ja JOKAINEN jako sellaisesta
//    tapahtumasta vei rikkinäiselle sivulle (mitattu 25.8.2026: 189/189).
//    Nyt katsotaan id-muotoa, joka on se mitä resolveri oikeasti tukee.
//
// 2) KILPAILIJAT: sovellus ei saa ohjata käyttäjää toiseen Helsinki-
//    tapahtumakalenteriin juuri sillä hetkellä kun tämä on päättämässä
//    lähtevänsä (omistaja 25.8.2026). Jos ainoa tiedossa oleva osoite on
//    kilpailijan, jaetaan oma etusivu — ei koskaan kilpailijan sivua.

/** Kilpailevat tapahtumakalenterit: linkkejä näihin ei jaeta eteenpäin, ja
 *  dedupissa mikä tahansa muu lähde saa korvata näiden osoitteen. */
const COMPETITOR_HOSTS = [
  'stadissa.fi',
  'menokone.hs.fi',
  'meno.hs.fi',
]

export function isCompetitorUrl(url: string | null | undefined): boolean {
  if (!url) return false
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return false
  }
  return COMPETITOR_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))
}

/** Ratkaiseeko /e/[id] tämän tapahtuman? Vastaa app/e/[id]/page.tsx:n
 *  getEventData-reititystä: tm-*, festival-* ja LinkedEventsin "lähde:tunnus"
 *  -muotoiset id:t. Skrapattujen lähteiden id:t (stadissa-*, venue-*, lippu-*)
 *  EIVÄT ratkea — niille ei saa tuottaa crawlattavaa linkkiä eikä jakolinkkiä. */
export function hasOwnEventPage(e: { id: string }): boolean {
  const id = e.id
  if (id.startsWith('tm-') || id.startsWith('festival-')) return true
  if (id.startsWith('rss-') || id.startsWith('recurring-')) return false
  // LinkedEvents-id: "helsinki:agqa74rrka" — kirjaimia, kaksoispiste, tunnus.
  // Yhdysviivallinen etuliite (museum-helsinki:…) on skraperin oma id.
  return /^[a-z_]+:[a-z0-9]+$/i.test(id)
}

/** Osoite jonka jakaminen ohjaa takaisin palveluun — ei koskaan kilpailijalle. */
export function shareUrlFor(
  e: { id: string; infoUrl?: string | null; ticketUrl?: string | null },
  base: string,
): string {
  if (hasOwnEventPage(e)) return `${base}/e/${encodeURIComponent(e.id)}`
  const external = [e.infoUrl, e.ticketUrl].find((u) => u && !isCompetitorUrl(u))
  return external ?? base
}

/** Tapahtuman ulkoinen linkki, tai null jos ainoa tiedossa oleva veisi
 *  kilpailijalle. Kutsuja näyttää silloin paikan oman sivun tai hakunapin. */
export function externalUrlFor(e: { infoUrl?: string | null; ticketUrl?: string | null }): string | null {
  return [e.ticketUrl, e.infoUrl].find((u) => u && !isCompetitorUrl(u)) ?? null
}

/** Viimeinen oljenkorsi kun tapahtumasta ei tiedetä linkkiä eikä paikan
 *  sivua: haku tapahtuman nimellä ja paikalla. Ei lupaa mitään, mutta vie
 *  eteenpäin — ja järjestäjän oma sivu on hakutuloksissa käytännössä aina
 *  kilpailijan listausta ylempänä. */
export function searchUrlFor(e: { title: string; location?: { name?: string | null } | null }): string {
  const q = [e.title, e.location?.name, 'Helsinki'].filter(Boolean).join(' ')
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}
