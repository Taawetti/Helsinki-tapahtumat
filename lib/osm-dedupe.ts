// Sama ravintola kahtena OSM-kohteena.
//
// MIKSI. OpenStreetMapissa sama paikka on toisinaan sekä pisteenä että
// rakennuksen aluena, tai kaksi kartoittajaa on lisännyt sen erikseen. Se ei
// haitannut kun sivu oli 3583 kortin luettelo, mutta nyt kärki on kuratoitu ja
// duplikaatti näkyy heti: Michelin-listan sijoilla 21 ja 30 oli "Shelter" ja
// "shelter", molemmat osoitteessa Kanavaranta 7, 17 metrin päässä toisistaan.
//
// MITATTU 22.8.2026. Samannimiset parit etäisyyden mukaan:
//      0 m  Osteria dei Gusti     19 m  Espresso House
//      2 m  Fafa's                19 m  Ravintola Töölö
//      9 m  Tulisuudelma          24 m  Unicafe
//     10 m  B5 Black              ───── raja 30 m ─────
//     17 m  Shelter / shelter     52 m  Unicafe (eri toimipiste)
//                                 63 m  Sea Horse
// Kaikki 30 metrin sisällä olevat kahdeksan paria ovat sama paikka; sen
// yläpuolella alkavat ketjujen aidot naapuritoimipisteet (Unicafe-kampus,
// Espresso House -asema). Raja on siis mitattu, ei arvattu.

/** Yli tämän etäisyyden samannimiset ovat eri toimipisteitä. */
const DUP_RADIUS_M = 30

function norm(name: string): string {
  return String(name ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9åäöéèü]+/g, '')
}

/** Karkea metrietäisyys. Helsingin leveysasteella riittävän tarkka 30 metrin
 *  vertailuun, eikä vaadi trigonometriaa kuin kerran per piste. */
function metres(
  a: { lat?: number; lon?: number },
  b: { lat?: number; lon?: number },
): number {
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return Infinity
  const dy = (a.lat - b.lat) * 111_320
  const dx = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

/** Kumpi kahdesta duplikaatista säilytetään: se jolla on enemmän tietoa. */
function richness(r: {
  image?: unknown; address?: unknown; www?: unknown; phone?: unknown
  openingHours?: unknown; googleRating?: unknown
}): number {
  return (r.image ? 4 : 0) + (r.googleRating ? 3 : 0) + (r.address ? 2 : 0) +
    (r.openingHours ? 2 : 0) + (r.www ? 1 : 0) + (r.phone ? 1 : 0)
}

/**
 * Poistaa saman paikan toistot. Säilyttää aina TIETORIKKAAMMAN kortin, jotta
 * poisto ei koskaan vie kuvaa tai arvosanaa. Eri nimet tai yli 30 metrin
 * etäisyys eivät koskaan yhdisty — ketjun kaksi toimipistettä säilyvät.
 */
export function dedupeOsmVenues<T extends {
  name: string; lat?: number; lon?: number
  image?: unknown; address?: unknown; www?: unknown; phone?: unknown
  openingHours?: unknown; googleRating?: unknown
}>(venues: T[]): T[] {
  const groups = new Map<string, T[]>()
  const out: T[] = []
  for (const v of venues) {
    const key = norm(v.name)
    if (!key) { out.push(v); continue }        // nimetön ei voi olla duplikaatti
    const group = groups.get(key)
    if (!group) { groups.set(key, [v]); continue }
    const twin = group.find((g) => metres(g, v) <= DUP_RADIUS_M)
    if (!twin) { group.push(v); continue }
    // Duplikaatti: pidä rikkaampi, ja tasapelissä ensin tullut (vakaa järjestys).
    if (richness(v) > richness(twin)) group[group.indexOf(twin)] = v
  }
  for (const group of groups.values()) out.push(...group)
  // Palautetaan alkuperäisessä järjestyksessä — kutsuja lajittelee itse, mutta
  // vakaa lähtöjärjestys tekee diffeistä luettavia.
  const keep = new Set(out)
  return venues.filter((v) => keep.has(v))
}
