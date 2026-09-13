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

/** Pelkkä maksunkeruulinkki (MobilePay-lippaan pay-in-QR-sivu) ei ole
 *  tapahtuman infosivu eikä lippukauppa — "Lue lisää" ei saa pudottaa
 *  käyttäjää suoraan "Lähetä rahaa lippaaseen" -näkymään (todettu
 *  tuotannosta 6.9.2026: LinkedEvents-järjestäjä oli laittanut offerin
 *  urliksi qr.mobilepay.fi-lippaan; hintateksti "10 € (Mobile Pay)" kertoo
 *  maksutavan jo valmiiksi). */
export function onMaksunkeruuUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    return h === 'qr.mobilepay.fi'
  } catch {
    return false
  }
}

/** Osoite jonka jakaminen ohjaa takaisin palveluun — ei koskaan kilpailijalle. */
export function shareUrlFor(
  e: { id: string; infoUrl?: string | null; ticketUrl?: string | null },
  base: string,
): string {
  if (hasOwnEventPage(e)) return `${base}/e/${encodeURIComponent(e.id)}`
  const external = [e.infoUrl, e.ticketUrl].find((u) => u && !isCompetitorUrl(u) && !onMaksunkeruuUrl(u))
  return external ?? base
}

/** Tapahtuman ulkoinen linkki, tai null jos ainoa tiedossa oleva veisi
 *  kilpailijalle. Kutsuja näyttää silloin paikan oman sivun tai hakunapin. */
export function externalUrlFor(e: { infoUrl?: string | null; ticketUrl?: string | null }): string | null {
  return [e.ticketUrl, e.infoUrl].find((u) => u && !isCompetitorUrl(u) && !onMaksunkeruuUrl(u)) ?? null
}

/** Mihin infopaneelin päätoiminto vie.
 *
 *  GOOGLE-HAKU POISTETTU 13.9.2026. Se oli tässä viimeisenä oljenkortena
 *  perusteluna että "järjestäjän oma sivu on hakutuloksissa käytännössä aina
 *  kilpailijan listausta ylempänä". Omistaja osoitti sen vääräksi: haulla
 *  "Pirjo Hassinen - Travel Galleria Pirkko-Liisa Topelius Helsinki" tulokset
 *  1 ja 2 olivat HS Menokone ja Stadissa.fi — molemmat juuri ne kalenterit
 *  jotka isCompetitorUrl estää. Nappi siis kiersi oman sääntönsä takaoven
 *  kautta, ja mitattuna se oli suosittu: 52 uloslinkkiklikistä 12 (23 %) meni
 *  google.comiin.
 *
 *  Tilalle EI tullut tyhjää vaan sovelluksen oma toiminto: paikan kaikki
 *  tapahtumat. Se on näille tapahtumille aidosti hyödyllinen — mitattu
 *  3 496 tapahtumasta: tyhjistä korteista 64 % on paikassa jossa on muitakin
 *  tapahtumia — ja käyttäjä jää palveluun sen sijaan että hänet lähetettäisiin
 *  hakuun joka tarjoaa kilpailijaa.
 *
 *  Viimeinen vaihtoehto on EI NAPPIA. Paneelissa on silti aika, paikka,
 *  Kartta, Reittiohjeet ja Lisää suunnitelmaan — kortti ei jää umpikujaksi. */
export type CtaKohde = 'ulkoinen' | 'paikan_sivu' | 'paikan_tapahtumat' | 'ei_nappia'

export function ctaKohde(
  ulkoinen: string | null,
  paikanSivu: string | null,
  paikanTapahtumatSaatavilla: boolean,
): CtaKohde {
  if (ulkoinen) return 'ulkoinen'
  if (paikanSivu) return 'paikan_sivu'
  return paikanTapahtumatSaatavilla ? 'paikan_tapahtumat' : 'ei_nappia'
}
