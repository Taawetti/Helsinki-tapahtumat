// Paikannimien yhtenäistys: sama talo eri lähteissä eri nimellä.
//
// MIKSI: lähteet kirjoittavat paikan nimen omalla tavallaan — lippu.fi
// "Helsingin Kulttuuritalo", stadissa.fi "KULT, Kulttuuritalo" (klubi-illat),
// kaupungin LinkedEvents, kulttuuritalo.fi ja MyHelsinki "Kulttuuritalo".
// Sovellus ryhmittelee tarkan merkkijonon mukaan: hakuehdotukset laskivat
// marraskuussa 2026 samalle talolle kolme riviä (29 + 9 + 4 tapahtumaa), ja
// sama esitys -sääntö (lib/sama-esitys) piti nimiä eri paikkoina, joten
// lippu.fi-rivit jäivät tuplakorteiksi. Mitattu 4.11.2026, 90 pv hakuikkuna:
// 24 paikkaa, joilla kaksi kirjoitusasua (kirjainkoko, viiva, heittomerkki,
// kaupunkisana edessä tai perässä).
//
// SÄÄNTÖ: nimi korvataan taulun kanonisella muodolla VAIN kun normalisoitu
// nimi (entiteetit purettu, pienet kirjaimet, välimerkit välilyönneiksi) on
// täsmälleen jokin taulun variantti. Nimen alku ei riitä: "Musiikkitalo,
// Konserttisali" kertoo salin eikä muutu. Kanoninen muoto on paikan oma
// virallinen kirjoitusasu tai, kun sitä ei voi todeta, lähteiden yleisin
// (lukumäärät 4.11.2026). Koordinaatit täydentää erikseen lib/venue-coords,
// jonka aliaksiin kanoninen nimi osuu. Kooste (app/api/events) kutsuu tätä
// ENNEN dedupia sekä LinkedEvents- että ulkoisille riveille.
// Puhdas funktio — testit scripts/test-categories.ts.

import { decodeHtmlEntities } from './utils'

export interface Paikannimi {
  /** Kanoninen kirjoitusasu. */
  nimi: string
  /** Variantit NORMALISOIDUSSA muodossa (ks. normalisoi) — kanonisen oma
   *  muoto osuu aina, sitä ei tarvitse listata. */
  variantit: string[]
}

export const PAIKANNIMET: Paikannimi[] = [
  // Sturenkatu 4: lippu.fi (24 riviä), stadissa.fi KULT-klubi (7)
  { nimi: 'Kulttuuritalo', variantit: ['helsingin kulttuuritalo', 'kult kulttuuritalo', 'kulttuuritalo helsinki'] },
  { nimi: 'Musiikkitalo', variantit: ['helsingin musiikkitalo', 'musiikkitalo helsinki', 'helsinki music centre'] },
  { nimi: 'Finlandia-talo', variantit: ['finlandia hall'] },
  { nimi: 'Messukeskus', variantit: ['messukeskus helsinki', 'helsingin messukeskus', 'helsinki expo and convention centre'] },
  { nimi: 'Olympiaterminaali', variantit: ['helsingin olympiaterminaali'] },
  { nimi: 'G Livelab Helsinki', variantit: ['g livelab'] },
  // Fienta kirjoittaa Konepajan näyttämön englanniksi (18 riviä), Tavastian
  // oma kauppa "Tavastia-klubi" (15) kun LinkedEvents sanoo "Tavastia" (44)
  { nimi: 'Konepajan näyttämö', variantit: ['stage konepaja'] },
  { nimi: 'Tavastia', variantit: ['tavastia klubi'] },
  // Kirjainkoko-, viiva- ja heittomerkkivariantit: virallinen kirjoitusasu
  { nimi: 'On the Rocks', variantit: [] },
  { nimi: 'Helsingin kaupunginmuseo', variantit: [] },
  { nimi: 'Helsingin tuomiokirkko', variantit: [] },
  { nimi: 'Aleksanterin teatteri', variantit: [] },
  { nimi: 'Maunula-talo', variantit: [] },
  { nimi: 'Kulttuurikeskus Caisa', variantit: [] },
  { nimi: 'Lauttasaaren kirkko', variantit: [] },
  { nimi: 'Balderin sali', variantit: [] },
  { nimi: "Henry's Music Bar", variantit: [] },
  // Lähteiden yleisin kirjoitusasu (4.11.2026), kun virallista ei voi todeta
  { nimi: 'Vapaan Taiteen Tila', variantit: [] },
  { nimi: 'Pasilan Vanhat Veturitallit', variantit: [] },
  { nimi: 'Oluthuone HAKA', variantit: [] },
  { nimi: 'Liszt-instituutti - Unkarin kulttuurikeskus', variantit: [] },
  { nimi: 'John Scott’s Arkadia', variantit: [] },
]

/** Vertailumuoto: entiteetit purettu, pienet kirjaimet, kaikki muu kuin
 *  kirjaimet ja numerot välilyönneiksi ("KULT, Kulttuuritalo" →
 *  "kult kulttuuritalo", "Henry’s" → "henry s"). */
export function normalisoiPaikannimi(nimi: string): string {
  return decodeHtmlEntities(nimi).toLowerCase().replace(/[^a-zäöå0-9]+/g, ' ').trim()
}

const HAKEMISTO: Map<string, string> = (() => {
  const m = new Map<string, string>()
  for (const p of PAIKANNIMET) {
    m.set(normalisoiPaikannimi(p.nimi), p.nimi)
    for (const v of p.variantit) m.set(v, p.nimi)
  }
  return m
})()

/** Kanoninen paikannimi, tai nimi sellaisenaan kun taulu ei tunne sitä. */
export function kanoninenPaikannimi(nimi: string): string {
  if (!nimi) return nimi
  return HAKEMISTO.get(normalisoiPaikannimi(nimi)) ?? nimi
}
