// Mikä teksti tapahtumasta NÄYTETÄÄN.
//
// Stadissa-skraperi lukee vain viikkokalenterin listaussivun, jossa on
// pelkkä otsikko, paikka, päivä ja tunti — kuvausta ei ole olemassa (eikä
// tapahtumasivua saa lukea). Jotta luokittelija näkisi edes paikan nimen,
// skraperi kirjoittaa `shortDescription: '@ <paikka>'`. Se on LUOKITTELIJAN
// SYÖTE, ei kuvaus: kortissa ja paneelissa se näkyi tekstinä joka toistaa
// paikan nimen, joka lukee jo rivin yläpuolella (omistajan havainto
// 13.9.2026).
//
// MIKSI SUODATUS ON NÄYTÖSSÄ EIKÄ API:SSA. classifyEvent lukee avainsanansa
// tekstistä `title + shortDescription + categories` — paikan nimeä se EI lue
// muuhun kuin VENUE_RULES-täsmäykseen. Jos placeholder poistettaisiin
// API:sta, 220 tapahtuman luokittelu muuttuisi kertaheitolla (mm.
// 'Stadin yhteisötalo' -sanat katoaisivat yhteisöohjelman tunnistuksesta).
// Näyttö korjataan siis näytössä ja syöte jätetään rauhaan.
//
// KAKSI FUNKTIOTA, KOSKA KUTSUJILLA ON ERI TARVE. Tämä ei ole tyylikysymys
// vaan mitattu virhe: ensimmäisessä versiossa oli vain naytettavaKuvaus, ja
// kun kortit kutsuivat sitä, 2 624 kortin lyhyt teaser vaihtui pitkäksi
// raakakuvaukseksi — kortit EIVÄT riisu HTML:ää, joten niissä olisi näkynyt
// <p>-tageja. Kortti haluaa lyhyen, paneeli kokonaisen.
//
// Placeholder-sääntö on TÄSMÄLLINEN, ei alkuosuma: mitattu 3 496
// tuotantotapahtumasta 13.9.2026 — täsmäsääntö osuu 220:een ja kaikki ovat
// stadissa-rivejä joilla ei ole lainkaan kuvausta. Löysä '@'-alkusääntö olisi
// vienyt lisäksi Kansallisteatterin kaksi riviä ('@ Taivassali,
// Kansallisteatteri'), joissa näyttämön nimi on aitoa lisätietoa.

interface KuvauksellinenTapahtuma {
  description?: string | null
  shortDescription?: string | null
  location?: { name?: string | null } | null
}

/** Onko teksti pelkkä skraperin paikkaplaceholder eikä kuvaus? */
export function onPaikkaPlaceholder(teksti: string | null | undefined, paikanNimi: string | null | undefined): boolean {
  const t = (teksti ?? '').trim()
  const p = (paikanNimi ?? '').trim()
  if (!t || !p) return false
  return t === `@ ${p}`
}

/** Lyhytkuvaus ilman placeholderia, tai null.
 *  KORTEILLE ja Idea-pakan "miksi"-tekstille: ne näyttävät lyhyen teaserin
 *  eivätkä riisu HTML:ää, joten pitkä `description` ei kelpaa niille. */
export function lyhytkuvaus(e: KuvauksellinenTapahtuma): string | null {
  const lyhyt = (e.shortDescription ?? '').trim()
  if (!lyhyt || onPaikkaPlaceholder(lyhyt, e.location?.name)) return null
  return lyhyt
}

/** Kokonainen näytettävä kuvaus, tai null jos näytettävää ei ole.
 *  PANEELILLE ja suunnitelman askeleelle: ne riisuvat HTML:n ja näyttävät
 *  koko tekstin, joten pitkä kuvaus voittaa lyhyen — sama järjestys kuin
 *  ennen tätä tiedostoa (`description || shortDescription`). */
export function naytettavaKuvaus(e: KuvauksellinenTapahtuma): string | null {
  const pitka = (e.description ?? '').trim()
  if (pitka) return pitka
  return lyhytkuvaus(e)
}
