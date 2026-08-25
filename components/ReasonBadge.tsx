'use client'

// Syymerkki — kortin tärkein rivi: MIKSI tämä paikka on tässä. Teksti tulee
// aina ulkopuolisesta nimetystä lähteestä, ei koskaan generoituna (ks.
// lib/restaurant-reasons.ts). Jaettu ravintola- ja tekemistä-näkymän kesken,
// jotta merkit näyttävät ja käyttäytyvät identtisesti molemmilla sivuilla.
//
// Värit erottavat lajit toisistaan mutta pysyvät hillittyinä, jottei ruudukko
// muutu liikennevaloksi.

import { reasonLabel, type ReasonKind, type RestaurantReason } from '@/lib/restaurant-reasons'
import type { TranslationKey } from '@/lib/i18n'
import { useLanguage } from '@/contexts/LanguageContext'

type Translate = (key: TranslationKey) => string

export const REASON_STYLE: Record<ReasonKind, { bg: string; fg: string; bd: string }> = {
  michelin:            { bg: 'rgba(239,68,68,.14)',  fg: '#fca5a5', bd: 'rgba(239,68,68,.18)' },
  'vuoden-ravintola':  { bg: 'rgba(251,191,36,.14)', fg: '#fcd34d', bd: 'rgba(251,191,36,.18)' },
  top50:               { bg: 'rgba(251,191,36,.11)', fg: '#fbbf24', bd: 'rgba(251,191,36,.15)' },
  uusi:                { bg: 'rgba(16,185,129,.14)', fg: '#6ee7b7', bd: 'rgba(16,185,129,.18)' },
  timeout:             { bg: 'rgba(139,148,255,.13)', fg: '#a3abff', bd: 'rgba(139,148,255,.16)' },
  // Huippuarvio käyttää tähtimerkin väriä, koska sen todiste ON arvostelut —
  // kortin ⭐-merkki ja tämä puhuvat samasta asiasta.
  huippuarvio:         { bg: 'rgba(251,191,36,.10)', fg: '#fcd34d', bd: 'rgba(251,191,36,.14)' },
  // Uutinen on syaani: viestii "juuri nyt" erottuen uutuuden vihreästä.
  uutinen:             { bg: 'rgba(56,189,248,.13)', fg: '#7dd3fc', bd: 'rgba(56,189,248,.18)' },
  // Näyttely on violetti: kulttuurisisältöä, ajankohtaista kuten uutinen
  // mutta museon omasta kalenterista.
  nayttely:            { bg: 'rgba(192,132,252,.13)', fg: '#d8b4fe', bd: 'rgba(192,132,252,.18)' },
}

/** "2 t sitten" / "eilen" / "3 pv sitten" — uutisrivin aikaleima. Jaettu
 *  ravintola- ja tekemistä-korttien kesken. Moduulitason funktio ei voi kutsua
 *  hookia, joten t tulee parametrina (sama kuvio kuin NewInHelsinkiView'n
 *  relativeNews). Luku yhdistetään avaimen loppuosaan täällä, koska avaimet
 *  sisältävät vain yksikön ("pv sitten" / "days ago"). */
export function relativeDate(pubDate: string, t: Translate): string {
  try {
    const diffH = Math.floor((Date.now() - new Date(pubDate).getTime()) / 3_600_000)
    if (diffH < 1)  return t('reason.rel_now')
    if (diffH < 24) return `${diffH} ${t('reason.rel_hours')}`
    const d = Math.floor(diffH / 24)
    if (d === 1)  return t('uutta.rel_yesterday')
    if (d < 7)   return `${d} ${t('uutta.rel_days')}`
    return `${Math.floor(d / 7)} ${t('uutta.rel_weeks')}`
  } catch { return '' }
}

export function ReasonBadge({ reason }: { reason: RestaurantReason }) {
  const { t, lang } = useLanguage()
  const s = REASON_STYLE[reason.kind] ?? REASON_STYLE.timeout
  return (
    <span
      className="inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-full border"
      style={{ background: s.bg, color: s.fg, borderColor: s.bd }}
      title={reason.source}
    >
      {reasonLabel(reason, t, lang)}
    </span>
  )
}
