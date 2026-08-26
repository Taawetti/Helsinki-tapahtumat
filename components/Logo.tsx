// Sovelluksen tunnus. KUVAKE-OHJE.md VERSIO 3 (26.8.2026), kohta 3.
//
// MERKKI ON FONTTIMERKKI, EI PIIRROS. Kysymysmerkki ladotaan tekstinä
// Inter 900:lla — samalla fontilla josta kuvakkeiden PNG:t on tuotettu.
// Aiempi versio piirsi sen SVG-polkuna, ja juuri se teki tuotannon
// kuvakkeesta väärän näköisen. Ohjeen kielto on yksiselitteinen:
//   "Älä piirrä kysymysmerkkiä SVG-polkuna."
//   "Älä käytä ikonikirjaston kysymysmerkkiä (lucide HelpCircle tms.)."
// Älä siis palauta vektoripolkuversiota tähän missään tilanteessa.
//
// MERKKI TULEE NIMEN PERÄÄN, ei eteen — se on nimen kysymysmerkki, ei
// erillinen ikoni. Tämäkin on ohjeessa oma kieltonsa.
//
// Fontti periytyy juurilayoutista (next/font Inter <html>-elementissä).
// fontFamily on silti kirjoitettu auki varmuuden vuoksi: jos merkki latoutuisi
// järjestelmäfontilla, se näyttäisi eri paksuiselta kuin kuvake.

interface LogoProps {
  /** Nimen kirjasinkoko. Kysymysmerkki skaalautuu tämän mukana samassa
   *  suhteessa kuin ohjeen mitoissa (16 → 21). */
  size?: number
  className?: string
}

export function Logo({ size = 16, className = '' }: LogoProps) {
  return (
    <span className={className} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <span style={{
        fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: size,
        color: '#fff', letterSpacing: '-.025em',
      }}>
        Mitä tänään
      </span>
      <span style={{
        fontFamily: 'Inter, sans-serif', fontWeight: 900, fontSize: size * 1.3125,
        lineHeight: 1, color: '#6b76ff', letterSpacing: '-.05em',
        transform: 'translateY(1px)',
      }}>
        ?
      </span>
    </span>
  )
}
