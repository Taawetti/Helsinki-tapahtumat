// Kuratoidut esittelytekstit paikoille, joilta puuttuu hyvä kuvaus
// (omistaja 6.11.2026: "tuo bas bas sirkus ravintolalle kuva ja esittely
// teksti, tuo myös kotiharjun saunalle info teksti").
//
// MIKSI. Ravintolan infopaneelin esittely tulee Googlen tiivistelmästä tai
// toimituksen tekstistä, ei koskaan generoidusta tekstistä (lib/types.ts,
// Restaurant.blurb). Uusi paikka voi puuttua Googlesta viikkoja: BasBas
// Sirkus oli 23.10.2026 "ei Googlessa", joten sen paneeli jäi ilman
// esittelyä. Oppaiden ja kartan paikkapaneelissa (PlaceDetailPanel) ei ollut
// tekstiä lainkaan.
//
// SÄÄNNÖT
//  – Jokainen teksti perustuu paikan omaan sivuun (lahde), ja tarkistuspäivä
//    kirjataan. Tarkista teksti, kun paikka muuttuu.
//  – Ei aukioloja, hintoja eikä aikasidonnaisia sanoja ("uusi"): ne
//    vanhenevat, ja paneelit näyttävät aukiolot muualta (OSM/Google).
//  – Tunnistus vaatii saman nimen ja saman kadun, koska sama nimi voi olla
//    eri paikalla (sama sääntö kuin kuratoiduissa yökerhoissa). Osoitteeton
//    rivi hyväksytään pelkällä nimellä.
//  – Tiedosto tuodaan myös selaimeen (PlaceDetailPanel), joten tänne ei saa
//    tuoda palvelinkoodia eikä isoa dataa.

import { samaKatu } from './katu'

export interface KuratoituEsittely {
  /** Paikan nimi; vertailu ei välitä kirjainkoosta eikä välimerkeistä. */
  nimi: string
  /** Osoite, jonka katua verrataan (lib/katu samaKatu). */
  osoite: string
  fi: string
  en: string
  /** Sivu, josta tekstin faktat on tarkistettu. */
  lahde: string
  /** Tarkistuspäivä, YYYY-MM-DD. */
  tarkistettu: string
}

/** Ravintolat: /api/restaurants asettaa tekstin esittelyksi (blurb), jos
 *  paikalla ei ole toimituksen valinnan (FEATURED_PICKS) eikä kuratoidun
 *  yökerhon tekstiä. Googlen tiivistelmä väistyy, koska blurb asetetaan
 *  ennen sitä. */
export const RAVINTOLAESITTELYT: readonly KuratoituEsittely[] = [
  {
    nimi: 'BasBas Sirkus',
    osoite: 'Paasivuorenkatu 4-6',
    fi: 'BasBas-ravintolaperheen ravintola ja leipomo Siltasaaressa, Paasivuorenpuistikon laidalla. Arkilounaalla on salaatteja, pastaa ja burgereita ilman pöytävarausta, ja iltaisin keittiö tarjoilee jaettavaa bistroruokaa, jossa pasta on pääosassa. Leipomopuolelta saa mukaan leivonnaisia, kahvia, leipää ja tuorepastaa.',
    en: 'The BasBas family’s restaurant and artisan bakery in Siltasaari, on the edge of Paasivuorenpuistikko park. Weekday lunch brings salads, pasta and burgers for walk-ins, and in the evenings the kitchen serves shareable bistro food with pasta at its heart. The bakery counter sells pastries, coffee, bread and fresh pasta to take away.',
    lahde: 'https://basbas.fi/sirkus/',
    tarkistettu: '2026-11-06',
  },
]

/** Oppaiden ja kartan paikat (saunat, museot, …): PlaceDetailPanel näyttää
 *  tekstin metakortin alla ja vie sen suunnitelman infokorttiin. */
export const PAIKKAESITTELYT: readonly KuratoituEsittely[] = [
  {
    nimi: 'Kotiharjun sauna',
    osoite: 'Harjutorinkatu 1',
    fi: 'Vuonna 1928 rakennettu Kotiharju on Helsingin ainoa jäljellä oleva perinteinen puulämmitteinen korttelisauna. Miesten ja naisten puolille ei tarvitse varata aikaa, ja kylpeä saa niin kauan kuin haluaa. Kassalta voi vuokrata pyyhkeen ja ostaa vihdan ja virvokkeita, ja löylyjen välissä jäähdytellään saunan edessä kadulla.',
    en: 'Built in 1928, Kotiharju is Helsinki’s only remaining traditional wood-heated public sauna. There is no need to book for the men’s and women’s sides, and you can bathe as long as you like. Towels, birch whisks and drinks are available at the counter, and between rounds bathers cool off on the pavement outside.',
    lahde: 'https://www.kotiharjunsauna.fi/',
    tarkistettu: '2026-11-06',
  },
]

/** Sama nimivertailu kuin /api/restaurants normName: pienaakkoset,
 *  välimerkit välilyönneiksi. */
const normNimi = (s: string): string => s.toLowerCase().replace(/[^a-zäöå0-9]+/g, ' ').trim()

function etsi(lista: readonly KuratoituEsittely[], nimi: string, osoite?: string | null): KuratoituEsittely | null {
  const n = normNimi(nimi)
  if (!n) return null
  return lista.find((e) => normNimi(e.nimi) === n && (!osoite || samaKatu(osoite, e.osoite))) ?? null
}

/** Ravintolan kuratoitu esittely nimellä ja osoitteella, tai null. */
export function ravintolanEsittely(nimi: string, osoite?: string | null): KuratoituEsittely | null {
  return etsi(RAVINTOLAESITTELYT, nimi, osoite)
}

/** Oppaan tai kartan paikan kuratoitu esittely nimellä ja osoitteella, tai null. */
export function paikanEsittely(nimi: string, osoite?: string | null): KuratoituEsittely | null {
  return etsi(PAIKKAESITTELYT, nimi, osoite)
}
