// Käsin tehdyt korjaukset yksittäisiin tapahtumiin: kuva, lippulinkki tai
// infolinkki, jota lähde ei anna. Tiedosto data/tapahtumakorjaukset.json,
// sovelletaan /api/events-koosteen lopussa kaikkien lähteiden tapahtumiin.
//
// MIKSI (omistaja 25.10.2026). "Jannan joulu" (Kallion kirkko 9.12.2026) tulee
// stadissa-lähteestä ilman kuvaa ja ilman lippulinkkiä, vaikka liput myydään
// lippu.fi:ssä ja juliste on olemassa. Lähteeseen ei voi kirjoittaa, ja
// lähdevarasto tallentaa lähteen rivit sellaisinaan — ainoa paikka jossa
// korjaus kattaa listan, kartan, heron ja jaetun /e/-sivun (joka lukee
// koosteen) on kooste itse.
//
// OSUMA, EI TUNNISTE. Sama tapahtuma voi tulla eri lähteestä eri tunnisteella
// (dedup valitsee voittajan lähdejärjestyksen mukaan), ja stadissa-tunniste
// vaihtuu jos ilmoitus tehdään uudelleen. Otsikko + Helsinki-päivä + paikka on
// se, minkä ihminen tunnistaa ja mikä pysyy. Vertailu on kirjainkoosta,
// ääkkösistä ja välimerkeistä riippumaton osajonohaku.
//
// KORJAUS EI POISTA MITÄÄN: vain annetut kentät asetetaan. Menneen päivän
// korjaus ei osu mihinkään, joten vanhat rivit ovat vaarattomia — ne voi
// siivota, kun tapahtuma on ohi.

import { helsinkiDateOf } from './helsinki-time'

export interface Tapahtumakorjaus {
  /** Lyhyt tunniste lokiin ja diffiin, esim. "jannan-joulu-kallion-kirkko-2026-12-09". */
  id: string
  osuma: {
    /** Osajono otsikosta, vähintään yksi sana. */
    otsikko: string
    /** Helsinki-päivä YYYY-MM-DD. */
    paiva: string
    /** Osajono paikan nimestä. Ilman tätä päivän kaikki saman otsikon tapahtumat osuvat. */
    paikka?: string
  }
  aseta: {
    image?: string
    ticketUrl?: string
    infoUrl?: string
  }
  muistiinpano?: string
}

export interface TapahtumakorjausTiedosto {
  korjaukset: Tapahtumakorjaus[]
}

/** Vähimmäismuoto, jonka korjaus tarvitsee — Event täyttää sen. */
export interface Korjattava {
  title: string
  startTime: string
  location?: { name?: string | null } | null
  image?: string | null
  ticketUrl?: string | null
  infoUrl?: string | null
}

/** Vertailumuoto: pienet kirjaimet, ääkköset pelkiksi kirjaimiksi, välimerkit välilyönneiksi. */
export const korjausAvain = (s: string | null | undefined): string =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

export function osuukoKorjaus(e: Pick<Korjattava, 'title' | 'startTime' | 'location'>, k: Tapahtumakorjaus): boolean {
  const otsikko = korjausAvain(k.osuma.otsikko)
  if (!otsikko) return false
  if (!korjausAvain(e.title).includes(otsikko)) return false
  let paiva: string
  try { paiva = helsinkiDateOf(e.startTime) } catch { return false }
  if (paiva !== k.osuma.paiva) return false
  if (k.osuma.paikka) {
    const paikka = korjausAvain(k.osuma.paikka)
    if (!paikka || !korjausAvain(e.location?.name).includes(paikka)) return false
  }
  return true
}

export function sovellaTapahtumakorjaukset<T extends Korjattava>(events: T[], korjaukset: readonly Tapahtumakorjaus[]): T[] {
  if (korjaukset.length === 0) return events
  return events.map((e) => {
    let tulos = e
    for (const k of korjaukset) {
      if (!osuukoKorjaus(e, k)) continue
      tulos = {
        ...tulos,
        ...(k.aseta.image ? { image: k.aseta.image } : {}),
        ...(k.aseta.ticketUrl ? { ticketUrl: k.aseta.ticketUrl } : {}),
        ...(k.aseta.infoUrl ? { infoUrl: k.aseta.infoUrl } : {}),
      }
    }
    return tulos
  })
}
