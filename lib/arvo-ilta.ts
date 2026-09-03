// "Arvo valmis ilta" — päivän ja kellon ratkaisu kaarimoottorille.
// PUHTAAT FUNKTIOT: kaikki ottavat now-hetken parametrina (testattavuus,
// ei Date.now-kutsuja kirjastossa). Aika luetaan AINA Helsingin
// seinäkellosta Intl:llä — palvelin voi olla UTC:ssä, käyttäjä missä vain.
//
// TÄRKEIN TAKUU (omistaja: "ei saa olla vääriä aikatauluja"): tälle
// kirjastolle kuuluu vain OIKEA date + nowH kaarimoottorille — itse
// aikataulutuksen oikeellisuus (aukiolot suunnitellulla hetkellä, oikeat
// tapahtuma-ajat ankkureina, kävelyajat, yön raja) on lib/group-schedulerin
// vastuulla ja sen 13 testin lukitsema. nowH annetaan VAIN kun kaaripäivä
// on tänään — tulevalle päivälle "nyt" ei saa rajata mitään.

import type { GroupWhen } from './candidate'

export type ArvoWhen = 'tonight' | 'day' | 'weekend'

/** Helsingin seinäkello annetulla hetkellä: ISO-päivä, viikonpäivä (0=su)
 *  ja desimaalitunti (esim. 21.5 = 21:30). */
export function helsinkiClock(now: Date): { date: string; weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  // Intl voi antaa keskiyön muodossa "24" — normalisoidaan 0:ksi.
  const rawHour = Number(get('hour'))
  const hour = (rawHour === 24 ? 0 : rawHour) + Number(get('minute')) / 60
  return { date: `${get('year')}-${get('month')}-${get('day')}`, weekday: WD[get('weekday')] ?? 0, hour }
}

/** ISO-päivä + n päivää (kalenteriaritmetiikka keskipäiväpuskurilla —
 *  DST-siirtymä ei pudota/duplikoi päivää). */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export interface ArcTarget {
  /** Kaaren päivä (ISO). */
  date: string
  /** Moottorin oletustuntitaulukko. */
  when: GroupWhen
  /** Helsingin desimaalitunti NYT — annetaan VAIN jos date on tänään. */
  nowH?: number
  /** Viikonloppuarvonnalle: seuraava kokeiltava päivä jos tämä ei toteudu
   *  (la-ilta myöhään → kokeile sunnuntaita). */
  fallbackDate?: string
}

/**
 * Ratkaisee kaaren päivän:
 *  - tonight/day → tänään, nowH mukana (moottori ei aikatauluta menneeseen)
 *  - weekend → kuluva tai seuraava lauantai; lauantaina itse päivä (nowH),
 *    sunnuntaina sunnuntai (nowH). Arkena tuleva lauantai ILMAN nowH:ta —
 *    tulevan päivän suunnitelmaa ei saa rajata tämän hetken kellolla.
 *    Lauantailta saa fallbackin sunnuntaihin (myöhäinen la-ilta → su).
 */
export function resolveArcTarget(when: ArvoWhen, now: Date): ArcTarget {
  const clock = helsinkiClock(now)
  if (when === 'tonight' || when === 'day') {
    return { date: clock.date, when: when === 'tonight' ? 'tonight' : 'day', nowH: clock.hour }
  }
  // weekend
  if (clock.weekday === 6) {
    return { date: clock.date, when: 'weekend', nowH: clock.hour, fallbackDate: addDays(clock.date, 1) }
  }
  if (clock.weekday === 0) {
    return { date: clock.date, when: 'weekend', nowH: clock.hour }
  }
  const daysToSaturday = 6 - clock.weekday
  return { date: addDays(clock.date, daysToSaturday), when: 'weekend' }
}

/** Jakoteksti WhatsAppiin: valmis suunnitelma riveinä. Vain groundattuja
 *  faktoja (ajat ja osoitteet moottorista) — ei generoituja lupauksia. */
export function planShareText(plan: {
  intro: string
  arc: { time?: string; emoji: string; title: string; address?: string; travelFromPrevMin?: number; travelFromPrevMode?: string }[]
}, dateLabel: string): string {
  const lines = [`${plan.intro} (${dateLabel})`, '']
  for (const s of plan.arc) {
    if (s.travelFromPrevMin && s.travelFromPrevMin > 0) {
      lines.push(`   ${s.travelFromPrevMode === 'transit' ? '🚌' : '🚶'} ~${s.travelFromPrevMin} min`)
    }
    lines.push(`${s.time ?? ''} ${s.emoji} ${s.title}${s.address ? ` — ${s.address}` : ''}`.trim())
  }
  lines.push('', 'Arvottu: mitatanaan.fi')
  return lines.join('\n')
}
