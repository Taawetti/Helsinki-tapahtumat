// Sama lippukaupan tuote → sama esitys.
//
// MIKSI: kaksi lähdettä kirjoittaa saman esityksen niin eri tavalla, ettei
// otsikko- eikä paikkasääntö (lib/sama-esitys) voi osua: LinkedEvents
// "Saiturin joulu" @ Konepajan näyttämö ja Fienta "Greta Tuotanto: A
// Christmas Carol" @ Stage Konepaja, 2.12.2026 klo 18.00. Molempien
// lippulinkki osoittaa kuitenkin samaan Fientan tuotteeseen
// (gretatuotantosaiturinjoulu), ja lippukaupan tuote on esityksen tarkin
// tunniste. Mitattu tuotannosta 4.11.2026, 90 pv hakuikkuna: 50 paria samalla
// tuotteella samana päivänä; 35 alkaa samaan minuuttiin (tai toisen aika on
// skraperin oletus), 6 eri aikaan, 9 on festivaalin tai orkesterin yhteinen
// ostosivu.
//
// SÄÄNTÖ: sama tuoteavain + sama Helsinki-päivä + sama alkuminuutti, ja
// MOLEMMILLA todellinen aika → sama esitys. Omistajan ehto pätee: kaksi eri
// esitysaikaa ei yhdisty koskaan, eikä tuntematon aika yhdisty. Skraperin
// oletusaika (startTimeApprox) EI kelpaa, toisin kuin sama esitys -säännössä:
// siellä otsikkosuhde kantaa, täällä vain linkki. Todettu 4.11.2026:
// Finlandia-talon sivu antaa "Pepe Willberg 80" -konsertille ja sen
// jatkoillalle saman linkin, ja jatkoillan rivi on varastossa oletusajalla —
// oletusajan ohitus olisi sulauttanut jatkoillan konserttiin.
//
// JAETTU TUOTE EI OLE TUNNISTE: festivaalin päivälippu tai klubi-illan lippu
// on sama kaikille saman illan esiintyjille. Jos YKSI lähde listaa saman
// tuotteen alle kaksi eri otsikkoa samaan minuuttiin, tuote ei tunnista
// esitystä sinä hetkenä (jaetutLipputuotteet) — muuten kaksi rinnakkaista
// lavaa sulautuisi yhdeksi kortiksi. Lisäksi kooste yhdistää vain, kun
// päivältä löytyy täsmälleen yksi ehdokas.
//
// TUOTEAVAIN: rekisteröitävä domain (kulttuuritalo.lippu.fi → lippu.fi) +
// polun tunnistava osa ilman kieli- ja listasanoja, numeerisia tunnisteita ja
// slugin numeroliitettä: Fientan sarjasivu /fi/s/<slug> ja kerta /<slug>-<id>
// saavat saman avaimen. Pelkkä kauppasivu ("buyingflow", "/tapahtuma/<id>",
// juuri) ei saa avainta — tunnistava osa tarvitsee viivan tai ≥ 12 merkkiä.
// Puhtaita funktioita — testit scripts/test-categories.ts.

import { helsinkiDateOf } from './helsinki-time'
import { tuntematonAika } from './utils'
import { normalisoiOtsikkoAvain } from './sama-esitys'

const LISTASANAT = new Set([
  'fi', 'en', 'sv', 's', 'e', 'event', 'events', 'tapahtuma', 'tapahtumat', 'esitys', 'esitykset',
  'liput', 'lippu', 'tickets', 'ticket', 'details', 'buyingflow', 'shop', 'kauppa', 'artist',
])

export interface LipputuoteVertailtava {
  title: string
  startTime: string
  startTimeApprox?: boolean
  ticketUrl?: string | null
}

/** Lippukaupan tuotteen avain lippulinkistä, tai null kun linkki ei
 *  tunnista yhtä tuotetta. */
export function lipputuoteAvain(url: string | null | undefined): string | null {
  if (!url) return null
  let u: URL
  try { u = new URL(url) } catch { return null }
  const host = u.hostname.toLowerCase().replace(/^www\./, '').split('.').slice(-2).join('.')
  const osat = u.pathname.toLowerCase().split('/').filter(Boolean)
    .filter((p) => !LISTASANAT.has(p) && !/^\d+$/.test(p))
  if (osat.length === 0) return null
  osat[osat.length - 1] = osat[osat.length - 1].replace(/-\d+$/, '')
  const tunnistava = osat[osat.length - 1]
  if (!tunnistava || (!tunnistava.includes('-') && tunnistava.length < 12)) return null
  return `${host}/${osat.join('/')}`
}

const helsinkiMinuutti = (iso: string): number => Math.floor(new Date(iso).getTime() / 60_000)

/** Ryhmä, jonka sisällä tuote tunnistaa esityksen: avain + päivä + minuutti.
 *  null kun ryhmää ei voi muodostaa (ei linkkiä, tuntematon tai oletusaika). */
export function lipputuoteRyhma(e: LipputuoteVertailtava): string | null {
  const avain = lipputuoteAvain(e.ticketUrl)
  if (!avain) return null
  if (e.startTimeApprox) return null
  let paiva: string
  try { paiva = helsinkiDateOf(e.startTime) } catch { return null }
  if (tuntematonAika(e.startTime)) return null
  const minuutti = helsinkiMinuutti(e.startTime)
  if (!Number.isFinite(minuutti)) return null
  return `${avain}|${paiva}|${minuutti}`
}

/** Ryhmät, joissa jokin YKSI lähde listaa kaksi eri otsikkoa: tuote on
 *  jaettu (festivaalin päivälippu, klubi-ilta) eikä tunnista esitystä. */
export function jaetutLipputuotteet(lahteet: readonly (readonly LipputuoteVertailtava[])[]): Set<string> {
  const jaetut = new Set<string>()
  for (const rivit of lahteet) {
    const otsikot = new Map<string, Set<string>>()
    for (const r of rivit) {
      const ryhma = lipputuoteRyhma(r)
      if (!ryhma) continue
      const s = otsikot.get(ryhma) ?? new Set<string>()
      s.add(normalisoiOtsikkoAvain(r.title))
      otsikot.set(ryhma, s)
      if (s.size >= 2) jaetut.add(ryhma)
    }
  }
  return jaetut
}

/** Sama tuote, sama päivä ja sama alkuminuutti, molemmilla todellinen aika.
 *  Täsmälleen sama otsikko hoidetaan dedup-avaimella, joten se ei kuulu
 *  tähän. Jaetut ryhmät (jaetutLipputuotteet) hylätään. */
export function onSamaLipputuote(a: LipputuoteVertailtava, b: LipputuoteVertailtava, jaetut: ReadonlySet<string>): boolean {
  if (normalisoiOtsikkoAvain(a.title) === normalisoiOtsikkoAvain(b.title)) return false
  const ra = lipputuoteRyhma(a)
  const rb = lipputuoteRyhma(b)
  if (!ra || ra !== rb) return false
  return !jaetut.has(ra)
}
