// Alakategorioiden KERTAKORJAUS todistepohjaiseksi (baarit + kahvilat +
// yökerhot).
//
// TAUSTA (mitattu 4.9.2026): LLM-luokittelija (enrich-subcategories) jakoi
// alakategoriat arvaamalla. Baarit: 144 "cocktail"-leimaa, todiste 17:llä
// (Oiva-pubi oli "cocktailbaari"). Kahvilat: "erikoiskahviloissa" oli bubble
// tea -ketjuja ja Neste, klassikoissa maauimalan kahvio. Kuratoitu kategoria
// lupaa varmuutta, joten leima vaatii NÄYTÖN:
//
//   1. TEKSTITODISTE: paikan nimi tai Googlen kategoria (myös lisäkategoriat)
//      osuu leiman säännöstöön (esim. "Cocktailbaari", "Kahvipaahtimo").
//   2. INSTITUUTIOVAHVISTUS (vain klassikot/boheemit, joilta tekstitodiste
//      puuttuu luonnostaan): olemassa oleva leima säilyy jos arvostelumassa
//      todistaa paikan aseman (Ekberg 3399 arvostelua on klassikko ilman
//      "klassikko"-sanaakin; kynnys alla).
//   3. OLUTIDENTITEETTI VOITTAA: oluttalo saa Googlen lisäkategorioihin
//      surutta "Cocktailbaari"-mainintoja (Bierhaus München) — cocktail/viini
//      säilyy oluttalolla vain jos se lukee paikan nimessä.
//
// Ilman näyttöä leima poistetaan → paikka näkyy Kaikki-selauksessa ja
// Suosituimmissa, ja näkymän tekstivarapolku (matchesSubCat) poimii nimestä/
// OSM-kuvauksesta osuvat kuratoituun listaan ilman kantaleimaakin.
// sub_categories jää tyhjänä TAULUKKONA (ei null) → LLM-ajon skip-joukko
// pitää rivin käsiteltynä eikä saastuta uudelleen.
//
// Ajo: npx tsx scripts/korjaa-alakategoriat.ts [--dry]

import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
const DRY = process.argv.includes('--dry')

// Sama säännöstö kuin enrich-subcategories-reitin todistevartijassa.
const TODISTEET: Record<string, RegExp> = {
  // baarit
  cocktail:     /cocktail|coctail|mixolog|drinkkibaari/i,
  craft_beer:   /panimo|brewery|brewing|taproom|olutbaari|olutravintola|olutsali|oluthuone|bierhaus|biergarten|beer bar|beer house|brewpub|craft beer/i,
  wine:         /viinibaari|wine bar|vinoteca|viinibistro|champagne/i,
  sports:       /urheilubaari|sports? bar/i,
  karaoke:      /karaoke/i,
  // kahvilat
  brunssi:      /brunssi|brunch/i,
  paahtimo:     /paahtimo|roaster|roastery|coffee roas/i,
  erikois:      /specialty|speciality|espresso ?ba|single.?origin|pour.?over|aeropress|kahvibaari/i,
  ranskalaiset: /patisserie|pâtisserie|boulangerie|konditoria|croissant|ranskalai|french caf/i,
  klassikot:    /klassikko/i,
  boheemit:     /boheemi|bohem|kissakahvila|kirjakahvila|taidekahvila/i,
  // yökerhot
  klubi:        /yökerho|nightclub|night ?club|klubi|live club|disco/i,
  tekno:        /tekno|techno/i,
  katto:        /kattobaari|kattoterassi|rooftop|roof ?top|sky ?(bar|room)/i,
}
const KAIKKI_SUBIT = Object.keys(TODISTEET)

// Instituutiovahvistus: leima ilman tekstitodistetta säilyy vain jos paikan
// arvostelumassa todistaa aseman. Vain kategorioille joita mikään virallinen
// lähde ei nimeä (klassikko/boheemi eivät ole Google-kategorioita).
const INSTITUUTIOKYNNYS: Record<string, number> = { klassikot: 600, boheemit: 300 }

interface Rivi {
  venue_key: string
  sub_categories: string[] | null
  review_count: number | null
  cat: string | null
  cats: string[] | null
}

;(async () => {
  const rivit: Rivi[] = []
  for (let a = 0; a < 8000; a += 1000) {
    const r = await fetch(
      `${SB_URL}/rest/v1/venue_ratings?select=venue_key,sub_categories,review_count,cat:google_raw->>category,cats:google_raw->additional_categories&order=venue_key`,
      { headers: { ...H, Range: `${a}-${a + 999}` } },
    )
    const era = (await r.json()) as Rivi[]
    if (!Array.isArray(era) || era.length === 0) break
    rivit.push(...era)
    if (era.length < 1000) break
  }
  console.log(`rivejä yhteensä: ${rivit.length}${DRY ? ' (kuivaharjoitus)' : ''}`)

  let muutettu = 0, ennallaan = 0, virhe = 0
  const jakauma: Record<string, number> = {}
  for (const r of rivit) {
    const vanhat = Array.isArray(r.sub_categories) ? r.sub_categories : []
    const teksti = [r.venue_key, r.cat ?? '', ...(r.cats ?? [])].join(' ')
    const sailyvat = vanhat.filter((s) => !KAIKKI_SUBIT.includes(s))
    let naytolliset = KAIKKI_SUBIT.filter((s) => TODISTEET[s].test(teksti))
    // Instituutiovahvistus: vanha leima ilman tekstitodistetta.
    for (const [sub, kynnys] of Object.entries(INSTITUUTIOKYNNYS)) {
      if (vanhat.includes(sub) && !naytolliset.includes(sub) && (r.review_count ?? 0) >= kynnys) {
        naytolliset.push(sub)
      }
    }
    // Olutidentiteetti voittaa (ks. otsikkokommentti).
    if (naytolliset.includes('craft_beer')) {
      naytolliset = naytolliset.filter((sub) =>
        sub !== 'cocktail' && sub !== 'wine' ? true : TODISTEET[sub].test(r.venue_key))
    }
    const uudet = [...new Set([...sailyvat, ...naytolliset])]
    if (JSON.stringify([...uudet].sort()) === JSON.stringify([...vanhat].sort())) { ennallaan++; continue }
    naytolliset.forEach((s) => { jakauma[s] = (jakauma[s] ?? 0) + 1 })
    if (DRY) { muutettu++; continue }
    const res = await fetch(`${SB_URL}/rest/v1/venue_ratings?venue_key=eq.${encodeURIComponent(r.venue_key)}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ sub_categories: uudet, last_updated: new Date().toISOString() }),
    })
    if (res.ok) muutettu++
    else { virhe++; console.error(`  patch ${res.status}: ${r.venue_key}`) }
  }
  console.log(`VALMIS: muutettu ${muutettu}, ennallaan ${ennallaan}, virheitä ${virhe}`)
  console.log('muuttuneiden näytölliset leimat:', JSON.stringify(jakauma))
})()
