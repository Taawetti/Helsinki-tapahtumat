// Katuvertailu paikkojen tunnistukseen. Siirretty 6.11.2026
// lib/helsinki-nightclubs.ts:stä omaksi pieneksi moduulikseen, jotta myös
// selaimeen tuotava koodi (lib/kuratoidut-esittelyt → PlaceDetailPanel) voi
// käyttää samaa sääntöä tuomatta yökerholistaa mukanaan.

/** Sama katu kahdessa osoitteessa: "Hämeentie 13 B" ~ "Hämeentie 13b",
 *  "Urho Kekkosen katu 4-6" ~ "Urho Kekkosen katu 6, sisäpiha". Vertaa vain
 *  katuosaa ennen talonumeroa, koska OSM:n ja kuratoitujen listojen
 *  numeromuodot eroavat. Pelkkä nimi ei tunnista paikkaa (sama nimi voi olla
 *  eri kadulla), eivätkä kuratoitujen listojen koordinaatit kelpaa
 *  tunnistukseen (ks. mittaus 5.11.2026: Kaiku 2,5 km OSM-rivistä). */
export function samaKatu(a: string, b: string): boolean {
  const katu = (s: string) => s.split(/\d/)[0].toLowerCase().replace(/[^a-zäöå]+/g, ' ').trim()
  const ka = katu(a), kb = katu(b)
  return ka.length > 2 && ka === kb
}
