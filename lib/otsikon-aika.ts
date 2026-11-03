// Otsikkoon kirjoitettu päivä ja kellonaika (omistaja 3.11.2026: Finlandia-
// talon kortin alt-teksti on muotoa "Bo Kaspers Orkester – Il Magnifico
// 29.11.2026 klo 16:00", ja skraperi antoi silti oletusajan 19:00 → stadissan
// sama keikka näkyi toisena korttina). Irrottaa lopusta päivän tai
// päivävälin (5.-7.11.2026) ja mahdollisen kellonajan. Puhdas funktio.

const PAIVA_JA_KLO_LOPUSSA = /\s+(?:\d{1,2}\.(?:\s*[-–]\s*\d{1,2}\.)?(?:\d{1,2}\.)?\d{4})(?:\s+klo\.?\s*(\d{1,2})[:.](\d{2}))?\s*$/i

export interface OtsikonAika {
  /** Otsikko ilman päivä- ja kellonaikaliitettä. */
  otsikko: string
  /** "HH:MM" jos otsikossa oli kellonaika, muuten null. */
  klo: string | null
}

export function irrotaOtsikonAika(title: string): OtsikonAika {
  const m = title.match(PAIVA_JA_KLO_LOPUSSA)
  if (!m) return { otsikko: title.trim(), klo: null }
  const otsikko = title.slice(0, m.index).trim()
  if (!otsikko) return { otsikko: title.trim(), klo: null }
  const h = m[1] !== undefined ? Number(m[1]) : null
  const min = m[2] !== undefined ? Number(m[2]) : null
  const klo = h !== null && min !== null && h >= 0 && h < 24 && min >= 0 && min < 60
    ? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
    : null
  return { otsikko, klo }
}
