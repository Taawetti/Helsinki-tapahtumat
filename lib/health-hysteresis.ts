// Terveysverdiktien vakautus (hystereesi) — max yksi tilanvaihto / vrk.
//
// MIKSI: syvä terveystarkistus (/api/health?deep=1) heilui DOWN↔UP, koska
// osa palvelinyksiköistä palveli lähteen dataa välimuistista (→ "kunnossa")
// ja osa törmäsi rikkinäiseen lähteeseen (→ "alhaalla"). UptimeRobot lähettää
// sähköpostin JOKA tilanvaihdosta, joten omistajan postilaatikko tulvi
// (1.9.2026: "voitko tehdä niin että tulee maksimissaan yksi sähköposti
// päivässä"). Yksittäinen vika on yksi tapahtuma — ei viestiketju.
//
// SÄÄNNÖT (puhdas funktio, lukittu testeillä scripts/test-categories.ts):
//   1. KUNNOSSA → ALHAALLA: heti, kun edellisestä tilanvaihdosta on kulunut
//      vähintään VAIHTOVÄLI (20 h). Ensimmäinen hälytys lähtee siis heti,
//      mutta uudelleen hajoava lähde ei voi tuottaa uutta hälytystä samana
//      vuorokautena.
//   2. ALHAALLA → KUNNOSSA: vasta kun tarkistus on ollut yhtäjaksoisesti
//      kunnossa TOIPUMISVAHVISTUS-ajan (6 h). Välimuistista tuleva "näyttää
//      kunnossa olevalta" -väläys ei siis käännä tilaa eikä lähetä UP-postia
//      kesken vian.
//   3. Tila säilytetään Supabasessa, EI muistissa: verdiktin pitää olla sama
//      riippumatta siitä mikä palvelinyksikkö vastaa.
//
// Vaihtokaupat sanottuna ääneen: aito uusi vika alle 20 h edellisestä
// vaihdosta näkyy vasta viiveellä, ja toipumisposti tulee ~6 h oikeaa
// toipumista myöhemmin. Tämä on lähdevahti (viikkotason ilmiöt), ei
// sivusto-pystyssä-vahti — sille tarkkuus riittää ja hiljaisuus on arvokasta.

export const VAIHTOVALI_MS = 20 * 60 * 60 * 1000        // min. aika tilanvaihtojen välillä
export const TOIPUMISVAHVISTUS_MS = 6 * 60 * 60 * 1000  // yhtäjaksoinen ok ennen UP:ta

export interface TerveysTila {
  /** 'ok' | 'down' — se tila jonka valvonta näkee */
  status: 'ok' | 'down'
  /** milloin status viimeksi vaihtui (ms epoch) */
  changedAt: number
  /** milloin yhtäjaksoinen ok-jakso alkoi down-tilan aikana (ms epoch), null jos ei käynnissä */
  okSince: number | null
}

export interface TerveysPaatos {
  tila: TerveysTila
  /** vaihtuiko status tällä kutsulla (→ UptimeRobot lähettää postin) */
  vaihtui: boolean
  /** tuore mittaus erosi näytettävästä tilasta (vaimennus/vahvistus käynnissä) */
  vaimennettu: boolean
}

/** Päättää näytettävän tilan tuoreen mittauksen ja tallennetun tilan pohjalta.
 *  Puhdas funktio: kello annetaan parametrina, jotta säännöt voi testata. */
export function paataTerveystila(
  tallennettu: TerveysTila | null,
  mitattuAlhaalla: boolean,
  nyt: number,
): TerveysPaatos {
  // Ensimmäinen kutsu ikinä: näytetään mittaus sellaisenaan. Tämä ei ole
  // "vaihto" (ei edellistä tilaa), joten vaihtoväli ei ala tästä rajoittaa.
  if (!tallennettu) {
    return {
      tila: { status: mitattuAlhaalla ? 'down' : 'ok', changedAt: nyt, okSince: null },
      vaihtui: false,
      vaimennettu: false,
    }
  }

  const { status, changedAt } = tallennettu

  if (status === 'ok') {
    if (!mitattuAlhaalla) {
      return { tila: { ...tallennettu, okSince: null }, vaihtui: false, vaimennettu: false }
    }
    // Vika havaittu. Vaihdetaan heti — paitsi jos edellinen vaihto on alle
    // vaihtovälin päässä (uudelleen hajoaminen heti toipumisen perään).
    if (nyt - changedAt >= VAIHTOVALI_MS) {
      return { tila: { status: 'down', changedAt: nyt, okSince: null }, vaihtui: true, vaimennettu: false }
    }
    return { tila: tallennettu, vaihtui: false, vaimennettu: true }
  }

  // status === 'down'
  if (mitattuAlhaalla) {
    // Vika jatkuu — mahdollinen kesken ollut toipumisjakso nollataan.
    return { tila: { ...tallennettu, okSince: null }, vaihtui: false, vaimennettu: false }
  }
  // Näyttää toipuneelta. Vaaditaan yhtäjaksoinen ok-jakso ennen vaihtoa,
  // koska välimuistit tuottavat vääriä toipumisväläyksiä kesken vian.
  const okSince = tallennettu.okSince ?? nyt
  if (nyt - okSince >= TOIPUMISVAHVISTUS_MS && nyt - changedAt >= VAIHTOVALI_MS) {
    return { tila: { status: 'ok', changedAt: nyt, okSince: null }, vaihtui: true, vaimennettu: false }
  }
  return { tila: { ...tallennettu, okSince }, vaihtui: false, vaimennettu: true }
}
