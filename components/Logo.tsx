// Sovelluksen tunnus. Toimitettu suunnittelijalta 26.8.2026
// (design_handoff_mita_tanaan/logo/KUVAKE-OHJE.md).
//
// MIKSI VEKTORIPOLKU EIKÄ KIRJOITETTU "?". Ohjeen sääntö: fontilla ladottu
// kysymysmerkki näyttää eri laitteilla eri paksuiselta, koska se riippuu
// fontin saatavuudesta. Polku näyttää kaikkialla samalta. Älä korvaa tätä
// tekstimerkillä äläkä generoi uudelleen.
//
// MIKSI MERKKI TULEE NIMEN PERÄÄN. Se on nimen "Mitä tänään" kysymysmerkki,
// ei erillinen ikoni nimen edessä. Ohjeessa tämä on oma kieltonsa. Aiemmin
// tässä oli indigo-laatta jossa luki M — se oli nimen EDESSÄ ja toistui
// kolmessa paikassa erikokoisena.
//
// Merkki perii värin tekstistä (currentColor), joten sama komponentti käy
// tummalle ja vaalealle pohjalle.

import type { CSSProperties } from 'react'

interface MarkProps {
  /** Merkin korkeus pikseleinä. Leveys johdetaan kuvasuhteesta (61:96). */
  size?: number
  className?: string
  style?: CSSProperties
  /** true kun merkki on näkyvän nimen vieressä — ks. LogoMark. */
  decorative?: boolean
}

export function LogoMark({ size = 26, className = '', style, decorative = false }: MarkProps) {
  // Nimen VIERESSÄ merkki on koriste: ruudunlukija lukisi muuten "Mitä tänään
  // Mitä tänään", koska sama teksti on jo näkyvänä elementtinä. Yksinään
  // (ilman tekstiä) merkki on sovelluksen nimi ja tarvitsee oman selitteensä.
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img', 'aria-label': 'Mitä tänään' }
  return (
    <svg viewBox="20 4 61 96" width={size * 0.635} height={size} className={className} style={style}
      {...a11y}>
      <path
        d="M 20 38 C 20 19 32 4 50 4 C 68 4 81 17 81 34 C 81 48 70 54 63 60 C 58 64.5 57 67 57 72 L 57 78 L 41 78 L 41 70 C 41 63 44 58 51 52 C 59 45 66 42 66 33 C 66 24 59 17 50 17 C 41 17 35 24 35 34 Z"
        fill="currentColor"
      />
      <circle cx="49" cy="91" r="9" fill="currentColor" />
    </svg>
  )
}

interface LogoProps {
  /** Nimen typografia. Oletus vastaa yläpalkin aiempaa sanamerkkiä, jotta
   *  kirjasinkoko ja -leikkaus eivät muutu merkin vaihdon yhteydessä. */
  textClassName?: string
  /** Merkin korkeus. Eri paikoissa eri koko — ks. kutsut, älä yhtenäistä. */
  markSize?: number
  textColor?: string
  markColor?: string
  className?: string
}

/** Nimi + merkki. Käytä tätä siellä missä sovelluksen tunnus näytetään. */
export function Logo({
  textClassName = 'font-black text-sm tracking-tight',
  markSize = 17,
  textColor = '#fff',
  markColor = '#6b76ff',
  className = '',
}: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={textClassName} style={{ color: textColor }}>Mitä tänään</span>
      <LogoMark size={markSize} style={{ color: markColor }} decorative />
    </span>
  )
}
