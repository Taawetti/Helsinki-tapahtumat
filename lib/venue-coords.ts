// Isojen tapahtumapaikkojen koordinaatit — TOIMITUKSELLINEN taulu, ei data
// (sama henki kuin lib/picks SUURET_PAIKAT: lyhyt lista paikkoja, joissa ei
// järjestetä pieniä iltoja).
//
// MIKSI: lippu.fi-, stadissa- ja festivals-lähteet antavat paikalle vain
// nimen, eivät koordinaatteja. Mitattu 4.10.2026: päivän 86 tapahtumasta 63
// putosi valmiiden runkojen ulkopuolelle, suurin osa koordinaattien puutteen
// takia — mm. HJK–HPS Bolt Arenalla, Lakritsi- & Salmiakkifestivaalit Wanha
// Satamassa ja Aavistus Festival Korjaamolla. Ilman koordinaatteja tapahtuma
// ei näy kartalla, sille ei lasketa etäisyyttä eikä sen viereen voi valita
// ravintolaa. Koosteen (/api/events) viimeinen normalisointi täydentää
// koordinaatit nimen perusteella, kun lähde ei niitä antanut.
//
// Koordinaatit haettu Nominatimista 4.10.2026 (pk-seuturajaus, 1 pyyntö/s) —
// ei arvattuja lukuja. Nimet verrataan NORMALISOITUINA (pienet kirjaimet,
// välimerkit välilyönneiksi) ja osumaksi kelpaa vain KOKO nimi tai nimen
// alku: "jäähalli" yksin ei riitä, koska Myllypuron ja Malmin jäähallit ovat
// eri paikkoja (siksi alias on 'helsingin jäähalli').

export interface IsoPaikka {
  /** Normalisoidut nimet (pienet kirjaimet, ei välimerkkejä). */
  nimet: string[]
  lat: number
  lon: number
  osoite?: string
}

export const ISOT_PAIKAT: IsoPaikka[] = [
  { nimet: ['olympiastadion', 'helsingin olympiastadion', 'stadion'], lat: 60.1870, lon: 24.9272, osoite: 'Paavo Nurmen tie 1' },
  { nimet: ['bolt arena', 'telia 5g areena', 'telia 5g arena', 'sonera stadium'], lat: 60.1876, lon: 24.9227, osoite: 'Urheilukatu 5' },
  { nimet: ['helsingin jäähalli', 'helsinki ice hall', 'nordis'], lat: 60.1892, lon: 24.9224, osoite: 'Nordenskiöldinkatu 11-13' },
  { nimet: ['veikkaus arena', 'helsinki halli', 'hartwall arena', 'helsinki areena'], lat: 60.2055, lon: 24.9291, osoite: 'Areenankuja 1' },
  { nimet: ['kauppatori', 'helsingin kauppatori', 'market square'], lat: 60.1672, lon: 24.9533 },
  { nimet: ['wanha satama'], lat: 60.1655, lon: 24.9675, osoite: 'Pikku Satamakatu 3-5' },
  { nimet: ['kaapelitehdas', 'kaapeli'], lat: 60.1619, lon: 24.9052, osoite: 'Tallberginkatu 1' },
  { nimet: ['tanssin talo'], lat: 60.1624, lon: 24.9054, osoite: 'Kaapeliaukio 3' },
  { nimet: ['musiikkitalo', 'helsinki music centre', 'helsingin musiikkitalo'], lat: 60.1738, lon: 24.9349, osoite: 'Mannerheimintie 13 A' },
  { nimet: ['kulttuuritalo', 'helsingin kulttuuritalo'], lat: 60.1884, lon: 24.9440, osoite: 'Sturenkatu 4' },
  { nimet: ['suvilahti'], lat: 60.1864, lon: 24.9717 },
  { nimet: ['kattilahalli'], lat: 60.1869, lon: 24.9701, osoite: 'Sörnäisten rantatie 22' },
  { nimet: ['kulttuuritehdas korjaamo', 'korjaamo'], lat: 60.1842, lon: 24.9198, osoite: 'Töölönkatu 51' },
  { nimet: ['kaisaniemen puisto', 'kaisaniemenpuisto'], lat: 60.1750, lon: 24.9461 },
  { nimet: ['hakaniementori', 'hakaniemen tori'], lat: 60.1794, lon: 24.9515 },
  { nimet: ['senaatintori'], lat: 60.1695, lon: 24.9523 },
  { nimet: ['rautatientori'], lat: 60.1704, lon: 24.9398 },
  { nimet: ['kansalaistori'], lat: 60.1736, lon: 24.9371 },
  { nimet: ['töölön kisahalli', 'kisahalli'], lat: 60.1834, lon: 24.9257, osoite: 'Paavo Nurmen kuja 1' },
  { nimet: ['finlandia talo', 'finlandia-talo', 'finlandia hall'], lat: 60.1758, lon: 24.9336, osoite: 'Mannerheimintie 13 E' },
  { nimet: ['messukeskus', 'helsingin messukeskus', 'helsinki expo and convention centre'], lat: 60.2039, lon: 24.9363, osoite: 'Messuaukio 1' },
  { nimet: ['töölönlahti', 'töölönlahden puisto'], lat: 60.1810, lon: 24.9341 },
  { nimet: ['esplanadin puisto', 'esplanadinpuisto', 'espan puisto', 'espa'], lat: 60.1674, lon: 24.9449 },
]

function normalisoi(nimi: string): string {
  return nimi.toLowerCase().replace(/[^a-zäöå0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Taulun paikka nimelle: koko nimi tai nimen alku ("Bolt Arena, Helsinki",
 *  "Musiikkitalo, Konserttisali") — ei pelkkä osuma keskellä, jotta "Malmin
 *  jäähalli" tai "Vanha Kauppatori 3" eivät osu. */
export function isoPaikka(nimi: string | null | undefined): IsoPaikka | null {
  if (!nimi) return null
  const n = normalisoi(nimi)
  if (!n) return null
  for (const p of ISOT_PAIKAT) {
    for (const alias of p.nimet) {
      const a = normalisoi(alias)
      if (n === a || n.startsWith(`${a} `) || n.startsWith(`${a},`)) return p
    }
  }
  return null
}

/** Täydentää puuttuvat koordinaatit (ja osoitteen) tunnetulle isolle paikalle.
 *  Lähteen omat koordinaatit voittavat aina — tämä koskee vain rivejä joilla
 *  ei ole mitään. */
export function taydennaKoordinaatit<L extends { name?: string; streetAddress?: string; lat?: number; lon?: number }>(loc: L | null): L | null {
  if (!loc || (loc.lat != null && loc.lon != null)) return loc
  const p = isoPaikka(loc.name)
  if (!p) return loc
  return { ...loc, lat: p.lat, lon: p.lon, streetAddress: loc.streetAddress || p.osoite || '' }
}
