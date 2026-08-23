// Kuinka luotettava arvosana on — arvostelujen määrä huomioiden.
//
// ONGELMA. Pelkkä arvosana valehtelee pienillä otoksilla. Sivulla oli
// vierekkäin Tian Tian Dumplings 4,1 (19 arvostelua) ja Palace 4,7 (358), ja
// edellinen oli ensin. Kolme arvostelua ja 4,9 ei kerro mitään; kaksituhatta
// arvostelua ja 4,6 kertoo paljon.
//
// RATKAISU on Wilsonin luottamusvälin alaraja: "kuinka hyvä tämä paikka on
// VÄHINTÄÄN, kun otoskoko otetaan huomioon". Se on monotoninen molempiin
// suuntiin — parempi arvosana nostaa aina, useampi arvostelu nostaa aina —
// mutta harvat arvostelut leikkaavat estimaattia rajusti.
//
// MITÄ TÄMÄ TAKAA JA MITÄ EI. Kaava toteuttaa säännön "ohut näyttö häviää
// paksulle näytölle":
//
//     2000 × 4,6  →  0,881        14 × 4,7  →  0,684
//     2000 × 4,6  →  0,881        19 × 4,1  →  0,566
//
// Se EI kuitenkaan tarkoita, että suurempi arvostelumäärä voittaisi aina.
// Aidosti korkea arvosana isolla otoksella on vahvempi näyttö kuin hieman
// matalampi vielä isommalla:
//
//     610 × 5,0 (MoMo Punavuori)  →  0,991
//    1978 × 4,9 (99 TopMeal)      →  0,967
//
// Se on oikea vastaus, ei virhe: 610 arvostelua ilman yhtäkään moitetta on
// poikkeuksellista. Sääntö koskee OHUTTA näyttöä, ei sitä että määrä yksin
// ratkaisisi. (Aiempi versio tästä tiedostosta väitti kommentissaan toisin ja
// yritti pakottaa 4,9:n voittamaan; se väite oli väärä.)

/**
 * Normaalijakauman kvantiili. 1,96 = 95 %:n KAKSISUUNTAINEN väli, eli
 * yksisuuntaisena 97,5 %. Valittu tarkoituksella varovaiseksi.
 */
const Z = 1.96

// ── HAJONTA ─────────────────────────────────────────────────────────────────
// Wilsonin klassinen kaava olettaa binomijakauman ja käyttää hajontana
// p(1−p):tä. Tähtiarvosanoille se on VÄÄRÄ MALLI kahdella tavalla, ja molemmat
// mitattiin 1450 helsinkiläisestä ravintolasta (vähintään 30 arvostelua,
// tähtijakauma haettu Googlen datasta):
//
//     arvosana   mitattu hajonta (75. pers.)   p(1−p)    suhde
//       4,15              0,0905               0,1673    0,54×
//       4,45              0,0630               0,1186    0,53×
//       4,65              0,0502               0,0798    0,63×
//       4,85              0,0287               0,0361    0,79×
//       4,95              0,0175               0,0123    1,42×
//       5,00              0,0041               0        äärettömän suuri
//
//   1. Keskialueella p(1−p) on lähes KAKSINKERTAINEN todelliseen nähden, eli
//      se rankaisee tavallisia paikkoja liikaa.
//   2. Kun p = 1 (arvosana tasan 5,0) se menee NOLLAAN ja kohtelee
//      yksimielisyyttä varmuutena. Mitattuna edes 5,0-paikat eivät ole
//      yksimielisiä: niiden hajonta on 0,0041.
//
// Siksi hajonta luetaan mittaustaulukosta eikä lasketa p(1−p):stä. Taulukossa
// on 75. persentiili eikä mediaani, koska yksittäisen paikan omaa hajontaa ei
// tiedetä — varovaisempi arvio on oikea, kun arvataan.
//
// Taulukon ulkopuolella (alle 3,95) käytetään reunimmaista arvoa; niitä
// paikkoja on aineistossa muutama eikä niiden keskinäinen järjestys ratkaise
// mitään, koska ne ovat joka tapauksessa listan hännillä.
const VARIANCE_BY_RATING: readonly (readonly [rating: number, variance: number])[] = [
  [3.95, 0.0686], [4.05, 0.0880], [4.15, 0.0905], [4.25, 0.0807],
  [4.35, 0.0719], [4.45, 0.0630], [4.55, 0.0582], [4.65, 0.0502],
  [4.75, 0.0409], [4.85, 0.0287], [4.95, 0.0175], [5.00, 0.0041],
]

/** Lineaarinen interpolointi mittaustaulukosta. */
function reviewVariance(rating: number): number {
  const t = VARIANCE_BY_RATING
  if (rating <= t[0][0]) return t[0][1]
  if (rating >= t[t.length - 1][0]) return t[t.length - 1][1]
  for (let i = 1; i < t.length; i++) {
    const [r1, v1] = t[i]
    if (rating <= r1) {
      const [r0, v0] = t[i - 1]
      const k = (rating - r0) / (r1 - r0)
      return v0 + k * (v1 - v0)
    }
  }
  return t[t.length - 1][1]
}

/**
 * Arvosana (1–5) ja arvostelujen määrä → 0–1. Suurempi on parempi.
 *
 * Arvostelematon paikka saa nollan: siitä ei tiedetä mitään. HUOM: myös tasan
 * 1,0:n arvosana antaa nollan, koska se on asteikon pohja — arvosteltu surkea
 * paikka ja tuntematon paikka eivät siis erotu toisistaan. Aineistossa on kaksi
 * tällaista paikkaa, molemmilla yksi arvostelu, joten sillä ei ole merkitystä;
 * kutsuja ei silti saa käyttää arvostelumäärää nollien erottelijana.
 *
 * Mitattuja arvoja:
 *      610 × 5,0  →  0,991      1978 × 4,9  →  0,967
 *      135 × 5,0  →  0,969      4185 × 4,6  →  0,886
 *     2000 × 4,6  →  0,881        80 × 5,0  →  0,955
 *       37 × 4,9  →  0,872        14 × 4,7  →  0,684
 *       19 × 4,1  →  0,566         3 × 5,0  →  0,437
 */
export function credibilityScore(rating: number | null | undefined, reviews: number | null | undefined): number {
  const n = typeof reviews === 'number' && Number.isFinite(reviews) ? Math.floor(reviews) : 0
  const r = typeof rating === 'number' && Number.isFinite(rating) ? rating : 0
  if (n <= 0 || r <= 0) return 0
  // Tähdet osuudeksi: 1★ = 0, 5★ = 1. Rajaus suojaa roskadatalta (esim. 5,4).
  const p = Math.max(0, Math.min(1, (r - 1) / 4))
  const variance = reviewVariance(Math.max(1, Math.min(5, r)))
  const z2 = Z * Z
  const den = 1 + z2 / n
  const centre = (p + z2 / (2 * n)) / den
  const margin = (Z * Math.sqrt(variance / n + z2 / (4 * n * n))) / den
  return Math.max(0, Math.min(1, centre - margin))
}
