// Helsinki-timezone helpers for server code. Vercel runs in UTC, so plain
// Date math (setHours, toISOString().split('T')) silently shifts times by
// 2-3 h and flips the calendar date between 00:00-03:00 Helsinki time.

const HKI_DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' })
const HKI_HOUR_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Helsinki', hour: '2-digit', hourCycle: 'h23',
})

/** Today's date in Helsinki as YYYY-MM-DD, regardless of server TZ. */
export function helsinkiToday(): string {
  return HKI_DATE_FMT.format(new Date())
}

/** Helsinki wall-clock as a locally-constructed Date — weekday/hour getters
 *  return Helsinki time on any server (UTC Vercel included). */
export function helsinkiNow(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const g = (t: string) => Number(parts.find((x) => x.type === t)!.value)
  return new Date(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second') % 60)
}

/** Helsinki calendar date (YYYY-MM-DD) of a timestamp — a 00:30 Helsinki event
 *  serialized as 21:30Z belongs to the NEXT Helsinki day, not the UTC day. */
export function helsinkiDateOf(iso: string): string {
  return HKI_DATE_FMT.format(new Date(iso))
}

/** Helsinki-kellonaikatunti (0–23) aikaleimasta. Suosituspintojen kelloraja
 *  (hero, iltapushi) EI saa lukea katsojan laitteen vyöhykettä: mitattu
 *  9.9.2026, 31 vrk:n korpus — laitevyöhykkeellä Europe/London hero antaa
 *  123 nostoa 154:n sijaan ja America/New_Yorkissa vain 53, koska illan
 *  tapahtumat siirtyvät väärälle puolelle klo 15 -rajaa. */
export function helsinkiHourOf(iso: string): number {
  return Number(HKI_HOUR_FMT.format(new Date(iso)))
}

const HKI_HM_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** Minuutit Helsingin vuorokauden alusta (19.30 → 1170). Käytä tätä kellon-
 *  aikasääntöihin: new Date(iso).getHours() elää AJON vyöhykkeessä, joka on
 *  Vercelin palvelimella UTC ja selaimessa Helsinki → sama sääntö osui eri
 *  riveihin ja aiheutti hydraatiovirheen (/yokerhot, 5.11.2026). */
export function helsinkiMinutesOfDay(iso: string): number {
  const [h, m] = HKI_HM_FMT.format(new Date(iso)).split(':').map(Number)
  return h * 60 + m
}

/** Helsinki date range from today forward, as YYYY-MM-DD strings. */
export function helsinkiDateRange(days: number): { start: string; end: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' })
  return {
    start: fmt.format(new Date()),
    end: fmt.format(new Date(Date.now() + days * 24 * 60 * 60 * 1000)),
  }
}

/** Helsinki UTC offset for a date: '+03:00' (EEST) or '+02:00' (EET), DST-aware.
 *  EI KOSKAAN HEITÄ: Intl.formatToParts heittää RangeErrorin kelvottomasta
 *  Datesta, ja koska helsinkiISO:a kutsutaan skrapereista (venues, allas,
 *  korjaamo, glivelab, rss…) ilman per-rivin suojaa, yksi roskainen päivä
 *  kaataisi KOKO lähteen — 15 keikkapaikkaa katoaisi yhden rivin takia.
 *  Kelvoton Date → nykyhetken offset (oikea lähitulevaisuuden tapahtumille);
 *  itse aikaleima jää tällöin virheelliseksi ja events-reitin per-tapahtuma-
 *  suojaus pudottaa sen yksittäisenä rivinä. */
export function helsinkiOffset(date: Date): string {
  const safe = Number.isFinite(date?.getTime?.()) ? date : new Date()
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Helsinki', timeZoneName: 'shortOffset' })
    .formatToParts(safe)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+3'
  const m = name.match(/([+-])(\d+)/)
  const sign = m?.[1] ?? '+'
  const h = m?.[2] ?? '3'
  return `${sign}${h.padStart(2, '0')}:00`
}

/** ISO timestamp for a Helsinki-local wall-clock time, e.g. 2026-07-15T19:00:00+03:00. */
export function helsinkiISO(y: number, month: number, day: number, hour: number, minute: number): string {
  // Noon UTC of the same date is safely inside the target day for offset lookup
  const approx = new Date(Date.UTC(y, month - 1, day, 12))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${y}-${p(month)}-${p(day)}T${p(hour)}:${p(minute)}:00${helsinkiOffset(approx)}`
}

// Onko aikaleimassa aikavyöhyke ('Z'/'z' tai '+03:00'/'-0500')?
const HAS_TZ = /(?:[Zz]|[+-]\d{2}:?\d{2})$/
// Päivä–aika-erotin. ISO 8601 sallii myös pienen kirjaimen, ja V8 jäsentää
// senkin naiivina paikallisena aikana → sama päivänvaihtobugi. Nykyisessä
// datassa (3 840 tapahtumaa) ei esiinny, mutta uusi lähde voi tuoda sellaisen.
// Erotin: 'T', pieni 't' TAI välilyönti ('YYYY-MM-DD HH:MM:SS' on Postgresin
// ja WordPress/Tribe-API:n oletusmuoto — bars-reitti muuntaa sen itse, mutta
// uusi lähde voi tuoda sen suoraan).
const HAS_TIME = /^\d{4}-\d{2}-\d{2}[Tt ]/

/**
 * Naiivi aikaleima (ilman Z:aa tai offsetia) → sama seinäkelloaika Helsingin
 * DST-tietoisella offsetilla. Muut palautetaan muuttumattomina.
 *
 * MIKSI: skraperit tuottavat paikallista seinäkelloaikaa merkkijonona
 * ("2026-08-22T23:30:00"). ECMAScript tulkitsee offsetittoman date-time-muodon
 * PAIKALLISENA aikana, joten Vercelillä (UTC) 23:30 luetaan 23:30 UTC = 02:30
 * Helsinkiä SEURAAVANA päivänä. Silloin helsinkiDateOf antaa väärän päivän →
 * tapahtuma putoaa "Illalla"-näkymästä, näkyy väärällä päivällä ja karkaa
 * dedupista (sama keikka kahtena korttina). Bugi on paikallisesti näkymätön:
 * TZ=Europe/Helsinki -koneella sama koodi antaa oikean tuloksen.
 *
 * Pelkkä päivä ("2026-08-22") palautetaan koskemattomana — koko päivän
 * tapahtumat renderöidään tarkoituksella ilman kelloaikaa (formatEventDate).
 */
export function normalizeHelsinkiTimestamp(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string') return iso ?? null
  const s = iso.trim()
  if (!s) return iso
  // HAS_TIME kattaa sekä 'T':n että 'YYYY-MM-DD'-muodon tarkistuksen: pelkkä
  // päivä ja tuntematon muoto palautetaan koskemattomina (ei arvailua).
  if (!HAS_TIME.test(s)) return iso
  if (HAS_TZ.test(s)) return iso          // aikavyöhyke jo mukana → älä koske
  // Offset luetaan aikaleiman OMASTA hetkestä, ei kohdepäivän keskipäivästä:
  // DST-vaihtopäivänä keskipäivä on eri puolella siirtymää kuin aamuyö, joten
  // keskipäiväprobe antoi kevään vaihtopäivänä aamuyölle offsetin +03:00 vaikka
  // oikea on +02:00 → aikaleima siirtyi tuntia taaksepäin ja putosi EDELLISELLE
  // kalenteripäivälle, eli tapahtuma katosi haetulta päivältä.
  //
  // KAKSIVAIHEINEN TARKENNUS: (1) tulkitse seinäkelloaika UTC:na ja lue sen
  // hetken offset, (2) vähennä se saadaksesi todellisen hetken ja lue offset
  // uudelleen. Yksi vaihe ei riitä — se on rajalla juuri offsetin verran
  // pielessä (klo 02:30 kevään vaihtopäivänä sai +03:00 eikä +02:00).
  // Olemattomassa "hypätyssä" tunnissa (03:00–03:59 keväällä) mikä tahansa
  // valinta on mielivaltainen; muut tapaukset osuvat oikein.
  // EROTIN NORMALISOIDAAN 'T':ksi: pieni 't' ja välilyönti ovat laillisia
  // syötteitä mutta huonoja ulostuloja — formatEventDate päättelee koko päivän
  // tapahtuman ehdolla !iso.includes('T'), joten välilyöntimuoto olisi
  // piilottanut kellonajan kortilta kokonaan. Ulos tulee aina kelvollinen ISO.
  const datePart = s.slice(0, 10)
  const timePart = s.slice(11)
  const asUtc = new Date(`${datePart}T${timePart}Z`)
  const base = Number.isNaN(asUtc.getTime()) ? new Date(`${datePart}T12:00:00Z`) : asUtc
  if (Number.isNaN(base.getTime())) return iso
  const first = helsinkiOffset(base)
  const m = first.match(/([+-])(\d{2}):(\d{2})/)
  const mins = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0
  const refined = new Date(base.getTime() - mins * 60_000)
  const offset = helsinkiOffset(Number.isNaN(refined.getTime()) ? base : refined)
  return `${datePart}T${timePart}${offset}`
}

// ── NÄKYVÄT PÄIVÄMÄÄRÄT ILMAN SELAIMEN KIELIDATAA (5.11.2026) ───────────────
// Noden (Vercel, Chrome) ja Safarin ICU-kirjastot tuottavat samoille
// Intl-asetuksille eri tekstin: fi "torstaina 5.11." vs "torstai 5.11.",
// en "Thu 5 Nov, 19:05" vs "Thu 5 Nov at 19:05", syyskuu "Sept" vs "Sep".
// Palvelimen HTML:n ja Safarin ensimmäisen renderin ero kaatoi hydraation
// koko sivulta jokaisella Safari- ja iPhone-latauksella 24.9.2026 lähtien
// (mitattu WebKitillä 5.11.2026; Chromessa ei näy, koska sama ICU kuin
// Nodessa). Näkyvät nimet tulevat siksi omista taulukoista. Numerot ja
// Helsinki-aikavyöhyke lasketaan edelleen Intl:llä (en-CA/en-GB numeeriset
// muodot ovat samat kaikissa moottoreissa).
const VIIKONPAIVAT_FI = ['sunnuntai', 'maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai']
const VIIKONPAIVAT_FI_ESSIIVI = ['sunnuntaina', 'maanantaina', 'tiistaina', 'keskiviikkona', 'torstaina', 'perjantaina', 'lauantaina']
const VIIKONPAIVAT_FI_LYHYT = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la']
const KUUKAUDET_FI_PARTITIIVI = ['tammikuuta', 'helmikuuta', 'maaliskuuta', 'huhtikuuta', 'toukokuuta', 'kesäkuuta', 'heinäkuuta', 'elokuuta', 'syyskuuta', 'lokakuuta', 'marraskuuta', 'joulukuuta']
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAYS_EN_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const kaksi = (n: number) => String(n).padStart(2, '0')

export interface HelsinkiOsat { vuosi: number; kuukausi: number; paiva: number; viikonpaiva: number; tunti: number; minuutti: number }

/** Helsinki-kalenterin osat: kuukausi 1–12, viikonpäivä 0 = sunnuntai.
 *  null, jos aikaleima ei ole kelvollinen. */
export function helsinkiOsat(aika: string | Date): HelsinkiOsat | null {
  const d = aika instanceof Date ? aika : new Date(aika)
  if (Number.isNaN(d.getTime())) return null
  const ymd = HKI_DATE_FMT.format(d)
  const [vuosi, kuukausi, paiva] = ymd.split('-').map(Number)
  const [tunti, minuutti] = HKI_HM_FMT.format(d).split(':').map(Number)
  return { vuosi, kuukausi, paiva, viikonpaiva: new Date(`${ymd}T12:00:00Z`).getUTCDay(), tunti, minuutti }
}

/** Mobiilin päivärivi: "torstaina 5.11." / "Thursday 05/11". */
export function paivaOtsikkoLyhyt(aika: string | Date, lang: 'fi' | 'en' = 'fi'): string {
  const o = helsinkiOsat(aika)
  if (!o) return ''
  return lang === 'en'
    ? `${WEEKDAYS_EN[o.viikonpaiva]} ${kaksi(o.paiva)}/${kaksi(o.kuukausi)}`
    : `${VIIKONPAIVAT_FI_ESSIIVI[o.viikonpaiva]} ${o.paiva}.${o.kuukausi}.`
}

/** Työpöydän päivärivi: "torstai 5. marraskuuta" / "Thursday 5 November". */
export function paivaOtsikkoPitka(aika: string | Date, lang: 'fi' | 'en' = 'fi'): string {
  const o = helsinkiOsat(aika)
  if (!o) return ''
  return lang === 'en'
    ? `${WEEKDAYS_EN[o.viikonpaiva]} ${o.paiva} ${MONTHS_EN[o.kuukausi - 1]}`
    : `${VIIKONPAIVAT_FI[o.viikonpaiva]} ${o.paiva}. ${KUUKAUDET_FI_PARTITIIVI[o.kuukausi - 1]}`
}

/** Listarivin aikaleima: "to 5.11. klo 19.00" / "Thu 5 Nov, 19:00", Helsinki-
 *  aikaa. Pelkkä päivämäärä (käynnissä oleva / koko päivän tapahtuma) ilman
 *  harhaanjohtavaa kellonaikaa. */
export function formatEventDate(iso: string, lang: 'fi' | 'en' = 'fi'): string {
  const o = helsinkiOsat(iso)
  if (!o) return iso
  const dateOnly = !iso.includes('T')
  if (lang === 'en') {
    const pvm = `${WEEKDAYS_EN_SHORT[o.viikonpaiva]} ${o.paiva} ${MONTHS_EN_SHORT[o.kuukausi - 1]}`
    return dateOnly ? pvm : `${pvm}, ${kaksi(o.tunti)}:${kaksi(o.minuutti)}`
  }
  const pvm = `${VIIKONPAIVAT_FI_LYHYT[o.viikonpaiva]} ${o.paiva}.${o.kuukausi}.`
  return dateOnly ? pvm : `${pvm} klo ${kaksi(o.tunti)}.${kaksi(o.minuutti)}`
}

/** Pubivisarivin aika numeerisella päivällä: "to 5.11. klo 19.00" /
 *  "Thu 05/11 19:00". Tyhjä, jos aikaleima ei kelpaa. */
export function formatEventDateNumeric(iso: string, lang: 'fi' | 'en' = 'fi'): string {
  const o = helsinkiOsat(iso)
  if (!o) return ''
  if (lang !== 'en') return formatEventDate(iso, 'fi')
  return `${WEEKDAYS_EN_SHORT[o.viikonpaiva]} ${kaksi(o.paiva)}/${kaksi(o.kuukausi)} ${kaksi(o.tunti)}:${kaksi(o.minuutti)}`
}
