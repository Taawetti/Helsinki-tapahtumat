// Sovelluksen tunnus. Toimitettu suunnittelijalta 26.8.2026
// (design_handoff_mita_tanaan/logo/KUVAKE-OHJE.md).
//
// MIKSI VEKTORIPOLKU EIKÄ KIRJOITETTU "?". Ohjeen sääntö: fontilla ladottu
// kysymysmerkki näyttää eri laitteilla eri paksuiselta, koska se riippuu
// fontin saatavuudesta. Polku näyttää kaikkialla samalta. Älä korvaa tätä
// tekstimerkillä äläkä generoi uudelleen.
//
// LAATTA, EI PALJAS MERKKI. KUVAKE-OHJE.md sanoi että merkki tulee nimen
// perään ilman laattaa, ja tein niin. Omistaja katsoi tulosta 26.8.2026 ja
// sanoi sen näyttävän väärältä: hyväksytyssä suunnitelmassa (kanvaan sivu
// "2B Täysi kysymys") merkki on indigo-laatan sisällä, ja paljaana pienessä
// koossa se lukeutuu ohueksi välimerkiksi eikä tunnukseksi.
// Omistajan ohje voittaa dokumentin. Laatta on nyt sama kuin kotinäytön
// kuvakkeessa: merkki 88 % laatan korkeudesta ja keskitetty, täsmälleen kuten
// design_handoff_mita_tanaan/logo/app-icon.svg — sama tunnus joka paikassa.
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

/** Sovelluksen kuvake sellaisenaan: indigo-laatta ja valkoinen merkki.
 *  Mittasuhteet luettu app-icon.svg:stä: merkki on 88 % laatan korkeudesta ja
 *  keskitetty. Älä muuta lukua — silloin yläpalkin tunnus lakkaisi vastaamasta
 *  kotinäytön kuvaketta. */
export function LogoTile({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      style={{
        width: size, height: size,
        borderRadius: Math.round(size * 0.28),
        background: 'linear-gradient(150deg,#6b76ff,#5059e6)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <LogoMark size={size * 0.88} style={{ color: '#fff' }} decorative />
    </span>
  )
}

interface LogoProps {
  /** Nimen typografia. Oletus vastaa yläpalkin aiempaa sanamerkkiä, jotta
   *  kirjasinkoko ja -leikkaus eivät muutu tunnuksen vaihdon yhteydessä. */
  textClassName?: string
  /** Laatan koko. Eri paikoissa eri koko — ks. kutsut, älä yhtenäistä. */
  tileSize?: number
  textColor?: string
  className?: string
}

/** Laatta + nimi. Käytä tätä siellä missä sovelluksen tunnus näytetään. */
export function Logo({
  textClassName = 'font-black text-sm tracking-tight',
  tileSize = 28,
  textColor = '#fff',
  className = '',
}: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoTile size={tileSize} />
      <span className={textClassName} style={{ color: textColor }}>Mitä tänään</span>
    </span>
  )
}
