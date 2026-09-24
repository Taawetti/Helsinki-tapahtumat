// Paikat, joiden tapahtumat eivät kuulu sovellukseen LAINKAAN — ei
// kategorioihin, hakuun, karttaan eikä suosituksiin.
//
// Omistaja 24.9.2026 Kallion listasta ("Avoin ompelupaja", "Nuorten
// työnhakupaja", "Tuolijumppa videolta" Stadin yhteisötalo Alppilassa):
// "poistetaan kokonaan tuo paikka ja kaikki sen tapahtumat. ne eivät ole
// sellaisia jotka kuuluvat sovelluksen profiiliin". Mitattu 24.9.2026:
// 32 tapahtumaa / 30 pv, kaikki LinkedEventsistä, kaikki päiväohjelmaa
// (jumppa, kielikurssit, lukupiirit, pajat).
//
// Tämä on ERI asia kuin lib/audience (kohderyhmärajaus): audience pudottaa
// tapahtuman vain SUOSITUKSISTA ja jättää sen kategorioihin; tämä lista
// poistaa paikan kaikkialta. Suodatus tehdään /api/events-aggregaatissa,
// jotta jokainen kuluttaja (lista, kartta, hero, haku, Idea, pushi) näkee
// saman datan.
//
// TOIMITUKSELLINEN LISTA yksittäisille paikoille: lisää rivi vain omistajan
// päätöksellä. Täsmäys paikan nimen alusta (pienet kirjaimet). Alppila on
// nyt katettu myös tyyppisäännöllä (yhteisötalo), rivi jää historiaksi.

const ESTETYT_PAIKAT: readonly string[] = [
  'stadin yhteisötalo alppila',
]

// PAIKKATYYPIT nimen perusteella. Omistaja 24.9.2026: "poistetaan kaikki nuo
// seniori/palvelukeskukset. eläkeläiset eivät käytä tätä sovellusta".
// Mitattu 24.9.2026 (30 pv, 3 894 tapahtumaa): kuvio osuu 21 paikkaan ja
// 289 tapahtumaan — Kampin palvelukeskus 70, Riistavuoren, Kontulan,
// Kinaporin, Töölön, Myllypuron, Koskelan seniorikeskus/Palvelukeskus,
// Roihuvuoren seniorikeskus, Kannelmäen/Laajasalon/Munkkiniemen palvelutalo…
// Jokainen otsikko-otos oli senioriohjelmaa (pingis, kuntosalilaiteopastus,
// vertaisryhmät, seniorikuoro, keppijumppa). Ei osu kulttuurikeskuksiin
// (Caisa, Stoa) eikä kauppakeskuksiin.
//
// YHTEISÖTALOT samalla päätöksellä (omistaja 24.9.2026 "kyllä poista nekin"):
// Stadin yhteisötalot ovat kaupungin asukastaloja, ohjelma lähialueen
// asukkaille päiväsaikaan. Mitattu 127 tapahtumaa / 30 pv kuudessa talossa:
// 113 alkaa ennen klo 15; sisältö talokahvit, aamupuuro, ompelupajat, bingo,
// tuolijooga, kielikahvilat, digituki — 1 iltakulttuuritapahtuma (levyraati).
// lib/audiencen COMMUNITY_VENUES piti ne jo poissa suosituksista; nyt ne
// poistuvat kokonaan. Sana 'asukastalo' mukana samasta syystä (sama paikkatyyppi,
// lib/audience listaa sen yhteisötalon rinnalla).
const ESTETYT_PAIKKATYYPIT = /seniorikeskus|palvelukeskus|palvelutalo|yhteisötalo|asukastalo/i

export function onEstettyPaikka(e: { location?: { name?: string | null } | null }): boolean {
  const n = (e.location?.name ?? '').trim().toLowerCase()
  if (!n) return false
  if (ESTETYT_PAIKKATYYPIT.test(n)) return true
  return ESTETYT_PAIKAT.some((p) => n === p || n.startsWith(p + ' ') || n.startsWith(p + ','))
}
