// "Sitoutunut käynti" — laatukonversio Google Adsille.
//
// MIKSI (mitattu 2.9.2026, 30 pv): lippuklikkejä on 6/kk (arvokas mutta liian
// harva Googlen oppimiseen) ja tapahtuma-avauksia 298/kk (volyymia, mutta
// yksittäinen avaus on kevyt signaali). Tämä yhdistää molemmat: käynti on
// sitoutunut kun kävijä avaa VÄHINTÄÄN KAKSI tapahtumaa tai tekee yhden
// arvoteon. Mitattu volyymi ~54/kk — riittää oppimiseen, ja juuri tämä
// mittari erotteli oikeat käyttäjät roskaliikenteestä (34–80 % vs 2 %).
//
// LÄHTEE KERRAN PER KÄYNTI. Tila on sessionStoragessa (kestää sivun
// uudelleenlatauksen saman käynnin sisällä); privaattitilassa varalla
// muistinvarainen tila (= kerran per sivulataus). Google Adsissa laskenta
// kannattaa silti asettaa muotoon "Yksi", jolloin Google deduplikoi
// mainosklikkiä kohden vaikka selain unohtaisi tilansa.
//
// Ydin on PUHDAS funktio (arvioiSitoutuminen) — säännöt lukittu testeissä
// scripts/test-categories.ts. Selainkuori (kirjaaToiminto) hoitaa vain
// tallennuksen.

import type { TrackKind } from './track'

/** Teot jotka tekevät käynnistä sitoutuneen yksinään. */
const ARVOTEOT: TrackKind[] = ['ticket_click', 'install', 'favorite_add', 'external_click']
/** Monesko tapahtuma-avaus tekee käynnistä sitoutuneen. */
const AVAUSKYNNYS = 2

export interface SitoutumisTila {
  avaukset: number
  ilmoitettu: boolean
}

export const TYHJA_TILA: SitoutumisTila = { avaukset: 0, ilmoitettu: false }

/** Päivittää tilan yhdellä teolla. `uusiSitoutuminen` on true täsmälleen
 *  sillä teolla joka ylittää kynnyksen — ei ennen eikä uudestaan. */
export function arvioiSitoutuminen(
  tila: SitoutumisTila,
  kind: TrackKind,
): { tila: SitoutumisTila; uusiSitoutuminen: boolean } {
  // 'engaged' itse ei saa ruokkia ilmaisinta — muuten yksi konversio
  // poikisi toisen.
  if (kind === 'engaged') return { tila, uusiSitoutuminen: false }

  const avaukset = kind === 'event_open' ? tila.avaukset + 1 : tila.avaukset
  const sitoutunut = ARVOTEOT.includes(kind) || avaukset >= AVAUSKYNNYS
  const uusiSitoutuminen = sitoutunut && !tila.ilmoitettu
  return {
    tila: { avaukset, ilmoitettu: tila.ilmoitettu || sitoutunut },
    uusiSitoutuminen,
  }
}

// ── Selainkuori ──────────────────────────────────────────────────────────────

const AVAIN = 'mt-sitoutuminen'
let muisti: SitoutumisTila = { ...TYHJA_TILA }

function lueTila(): SitoutumisTila {
  try {
    const raw = sessionStorage.getItem(AVAIN)
    if (raw) return JSON.parse(raw) as SitoutumisTila
  } catch { /* privaattitila → muistivara */ }
  return muisti
}

function tallennaTila(tila: SitoutumisTila): void {
  muisti = tila
  try { sessionStorage.setItem(AVAIN, JSON.stringify(tila)) } catch { /* privaattitila */ }
}

/** Kirjaa teon ja kertoo, muuttuiko käynti juuri nyt sitoutuneeksi.
 *  Kutsutaan lib/trackista — sama poissulkuketju pätee siis automaattisesti. */
export function kirjaaToiminto(kind: TrackKind): boolean {
  const { tila, uusiSitoutuminen } = arvioiSitoutuminen(lueTila(), kind)
  tallennaTila(tila)
  return uusiSitoutuminen
}
