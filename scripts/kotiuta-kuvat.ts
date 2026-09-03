// Ravintola- ja aktiviteettikuvien KOTIUTUS — kuvat omaan varastoon, jotta
// ne eivät vanhene.
//
// TAUSTA (mitattu 3.9.2026): rikastuksen tallentamat Googlen kuvaosoitteet
// (lh3.googleusercontent.com/gps-cs-s/…) vanhenevat viikoissa — otos 40/40
// palautti 403. Korteista vain ~640/3 611:llä oli aidosti toimiva kuva.
// Uudelleenrikastus olisi juoksumatto: tuoreet osoitteet vanhenisivat taas.
// Ratkaisu: lataa kuva KERRAN, pienennä ja tallenna omaan Supabase Storage
// -buckettiin (lib/kuvavarasto) → osoite ei vanhene koskaan. venue_ratings.
// main_image päivitetään osoittamaan omaan varastoon, jolloin /api/restaurants
// ja /api/activities toimivat ilman koodimuutoksia. Putket kotiuttavat uudet
// kuvat nykyään heti hakiessa (lib/kuvavarasto) — tämä skripti on takautuva
// korjaus ja pelastusväline.
//
// VAIHEET:
//   --vaihe elavat        ILMAINEN: kotiuttaa venue_ratingsin vielä toimivat
//                         kuvaosoitteet (katunäkymät ym. ei-lh3).
//   --vaihe kuolleet      MAKSULLINEN (~0,0054 $/haku): ravintolakorteille
//                         joiden kuva on kuollut lh3-osoite haetaan tuore
//                         kuva DataForSEOsta (nimivartijalla), ladataan HETI
//                         (tuore osoite vanhenee sekin) ja kotiutetaan.
//   --vaihe aktiviteetit  MAKSULLINEN: sama kuolleille act:-riveille —
//                         aktiviteettikortit lukevat ne /api/activities-
//                         rikastuksessa, eli kuollut kuva näkyy käyttäjälle.
//   --vaihe avaukset      data/new-openings.json:n lainalinkit omaan
//                         varastoon ja JSON uusiksi. Osa kuvista on jo
//                         varastossa ("orvot": kuolleet-vaihe latasi kuvan
//                         mutta JSON osoitti yhä vanhaan osoitteeseen).
//   --raja N              käsittele enintään N kohdetta (oletus: kaikki)
//   --dry                 älä lataa/kirjoita mitään, näytä määrät ja hinta
//
// KESKEYTYKSENKESTÄVÄ: eteneminen kirjataan tilatiedostoon (--tila <polku>),
// ja valmiit ohitetaan uudelleenajossa. Yksittäisen kohteen virhe ei kaada
// ajoa. KATKAISIN keskeyttää jos DataForSEO kaatuu kesken (kävi 1. ajossa:
// 670 hakua kirjautui virheeksi putkeen) — jatko samalla tilatiedostolla.
//
// Ajo: npx tsx scripts/kotiuta-kuvat.ts --vaihe <vaihe> --tila <polku>

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { lookupWithRetry, nameOverlap } from '../lib/dataforseo'
import { kotiutaKuvaTaiHeita, onOmassaVarastossa, varastoOsoite } from '../lib/kuvavarasto'

// .env.local käsin (skripti ajetaan Nextin ulkopuolella). Importit hoistataan
// tämän yläpuolelle, mutta se ei haittaa: lib lukee envin vasta kutsuhetkellä.
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
const HINTA_PER_HAKU = 0.0054

const arg = (nimi: string): string | null => {
  const i = process.argv.indexOf(`--${nimi}`)
  return i >= 0 ? (process.argv[i + 1] ?? '') : null
}
const VAIHE = arg('vaihe')
const RAJA = Number(arg('raja') ?? Infinity)
const DRY = process.argv.includes('--dry')
const TILA_POLKU = arg('tila') ?? '/tmp/kotiutus-tila.json'

interface Tila { valmiit: string[]; virheet: Record<string, string> }
const tila: Tila = existsSync(TILA_POLKU)
  ? JSON.parse(readFileSync(TILA_POLKU, 'utf8'))
  : { valmiit: [], virheet: {} }
const valmiit = new Set(tila.valmiit)
const tallennaTila = () => writeFileSync(TILA_POLKU, JSON.stringify(tila))

const onLh3 = (u: string) => { try { return new URL(u).hostname === 'lh3.googleusercontent.com' } catch { return false } }

async function paivitaMainImage(venueKey: string, omaUrl: string): Promise<void> {
  const r = await fetch(`${SB_URL}/rest/v1/venue_ratings?venue_key=eq.${encodeURIComponent(venueKey)}`, {
    method: 'PATCH',
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ main_image: omaUrl, last_updated: new Date().toISOString() }),
  })
  if (!r.ok) throw new Error(`patch ${r.status}`)
}

async function haeMainImaget(): Promise<{ venue_key: string; main_image: string }[]> {
  const rivit: { venue_key: string; main_image: string }[] = []
  for (let a = 0; a < 20000; a += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/venue_ratings?select=venue_key,main_image&main_image=not.is.null&order=venue_key`, {
      headers: { ...H, Range: `${a}-${a + 999}` },
    })
    const era = (await r.json()) as { venue_key: string; main_image: string }[]
    if (!Array.isArray(era) || era.length === 0) break
    rivit.push(...era)
    if (era.length < 1000) break
  }
  return rivit
}

// ── Vaihe: elävät (ilmainen) ────────────────────────────────────────────────
async function vaiheElavat() {
  const kaikki = await haeMainImaget()
  // r.main_image && — kannassa on myös tyhjiä merkkijonoja (92 kpl), joilla
  // ei ole mitään kotiutettavaa; ilman vartijaa ne kirjautuisivat virheiksi
  // joka ajossa.
  const kohteet = kaikki.filter((r) => r.main_image && !onLh3(r.main_image) && !onOmassaVarastossa(r.main_image) && !valmiit.has(r.venue_key)).slice(0, RAJA)
  console.log(`elävät: ${kohteet.length} kotiutettavaa (yht. ${kaikki.length} main_imagea)`)
  if (DRY) return
  let ok = 0, virhe = 0
  for (const k of kohteet) {
    try {
      const oma = await kotiutaKuvaTaiHeita(k.venue_key, k.main_image)
      await paivitaMainImage(k.venue_key, oma)
      tila.valmiit.push(k.venue_key); valmiit.add(k.venue_key)
      delete tila.virheet[k.venue_key]; ok++
    } catch (e) {
      tila.virheet[k.venue_key] = (e as Error).message; virhe++
    }
    tallennaTila()
    if ((ok + virhe) % 25 === 0) console.log(`  ${ok + virhe}/${kohteet.length} (ok ${ok}, virhe ${virhe})`)
  }
  console.log(`VALMIS elävät: ok ${ok}, virhe ${virhe}`)
}

// ── Yhteinen hakumoottori (kuolleet + aktiviteetit) ─────────────────────────
interface HakuKohde { avain: string; nimi: string; osoite?: string }

/** DataForSEO-haku nimivartijalla, lataus heti, varastoon, main_image
 *  päivitetään. Palauttaa laskurit; kirjaa virheet tilatiedostoon. */
async function hataKotiutus(kohteet: HakuKohde[]) {
  const CONCURRENCY = 4 // sama kuin rikastuksessa: kuudella ~30 % aikakatkaisi
  // KATKAISIN (lisätty 3.9.2026): ensimmäisessä ajossa DataForSEO kaatui
  // kesken ja 670 hakua kirjautui virheeksi putkeen. Jos palvelu kuolee
  // taas, ajo keskeytyy eikä jauha koko listaa läpi turhaan — tilatiedoston
  // ansiosta jatko onnistuu myöhemmin samasta kohdasta.
  const KATKAISURAJA = 24
  let peräkkäisetTekniset = 0
  let ok = 0, eiKuvaa = 0, eriNimi = 0, virhe = 0
  for (let i = 0; i < kohteet.length; i += CONCURRENCY) {
    const aalto = kohteet.slice(i, i + CONCURRENCY)
    await Promise.all(aalto.map(async (k) => {
      try {
        const q = k.osoite ? `${k.nimi} ${k.osoite} Helsinki` : `${k.nimi} Helsinki`
        // lookupWithRetry uusii vain TYHJÄT vastaukset; teknisen virheen
        // (null: HTTP-virhe, aikakatkaisu) uusinta hoidetaan tässä.
        let biz = null
        for (let y = 0; y < 3 && !biz; y++) {
          if (y > 0) await new Promise((s) => setTimeout(s, 5000))
          biz = await lookupWithRetry(q)
        }
        if (!biz) { tila.virheet[k.avain] = 'tekninen virhe (3 yritystä)'; virhe++; peräkkäisetTekniset++; return }
        peräkkäisetTekniset = 0
        if (!biz.found) { tila.virheet[k.avain] = 'ei löytynyt googlesta'; virhe++; return }
        // Sama nimivartija kuin enrich-new-places: väärä paikka on pahempi
        // kuin puuttuva kuva.
        if (nameOverlap(k.nimi, biz.title ?? '') < 0.5) { tila.virheet[k.avain] = `eri nimi ("${biz.title}")`; eriNimi++; return }
        if (!biz.image) { tila.virheet[k.avain] = 'googlella ei kuvaa'; eiKuvaa++; return }
        // Lataus HETI — tuore osoite vanhenee sekin.
        const oma = await kotiutaKuvaTaiHeita(k.avain, biz.image)
        await paivitaMainImage(k.avain, oma)
        tila.valmiit.push(k.avain); valmiit.add(k.avain)
        delete tila.virheet[k.avain]; ok++
      } catch (e) {
        tila.virheet[k.avain] = (e as Error).message; virhe++
      }
    }))
    tallennaTila()
    if (peräkkäisetTekniset >= KATKAISURAJA) {
      console.error(`KATKAISTU: ${peräkkäisetTekniset} teknistä virhettä putkeen — DataForSEO on todennäköisesti nurin. Aja uudelleen myöhemmin samalla --tila-tiedostolla.`)
      process.exit(2)
    }
    const tehty = Math.min(i + CONCURRENCY, kohteet.length)
    if (tehty % 40 < CONCURRENCY || tehty === kohteet.length) {
      console.log(`  ${tehty}/${kohteet.length} — ok ${ok}, ei kuvaa ${eiKuvaa}, eri nimi ${eriNimi}, virhe ${virhe} (~${(tehty * HINTA_PER_HAKU).toFixed(2)} $)`)
    }
  }
  return { ok, eiKuvaa, eriNimi, virhe }
}

// ── Vaihe: kuolleet (maksullinen) ───────────────────────────────────────────
async function vaiheKuolleet() {
  // Kohteet: tuotannon kortit joiden näkyvä kuva on kuollut lh3-osoite.
  // Nimi+osoite tulee korteista (sama kysely kuin alkuperäisessä
  // rikastuksessa); venue_key on API:n käyttämä nimipohjainen avain.
  const res = await fetch('https://mitatanaan.fi/api/restaurants')
  const data = (await res.json()) as { restaurants: { name: string; address?: string; image?: string | null }[] }
  // Ketjut jakavat venue_keyn — kotiutus kerran per avain riittää, koska
  // kortitkin jakavat saman main_imagen.
  const nahty = new Set<string>()
  const kohteet: HakuKohde[] = []
  for (const r of data.restaurants) {
    if (!r.image || !onLh3(r.image)) continue
    const avain = r.name.toLowerCase().trim()
    if (nahty.has(avain) || valmiit.has(avain)) continue
    nahty.add(avain)
    kohteet.push({ avain, nimi: r.name, osoite: r.address })
    if (kohteet.length >= RAJA) break
  }
  console.log(`kuolleet: ${kohteet.length} hakua → hinta-arvio ${(kohteet.length * HINTA_PER_HAKU).toFixed(2)} $`)
  if (DRY) return
  const t = await hataKotiutus(kohteet)
  console.log(`VALMIS kuolleet: ok ${t.ok}, ei kuvaa ${t.eiKuvaa}, eri nimi ${t.eriNimi}, virhe ${t.virhe}`)
}

// ── Vaihe: aktiviteetit (maksullinen) ───────────────────────────────────────
async function vaiheAktiviteetit() {
  // venue_ratingsin act:-rivit joiden kuva on kuollut lh3-osoite. Nimi on
  // avaimessa (act:<nimi>) — sama muoto jolla enrich-activities-all ne loi.
  const kaikki = await haeMainImaget()
  const kohteet: HakuKohde[] = kaikki
    .filter((r) => r.venue_key.startsWith('act:') && onLh3(r.main_image) && !valmiit.has(r.venue_key))
    .slice(0, RAJA)
    .map((r) => ({ avain: r.venue_key, nimi: r.venue_key.slice(4) }))
  console.log(`aktiviteetit: ${kohteet.length} hakua → hinta-arvio ${(kohteet.length * HINTA_PER_HAKU).toFixed(2)} $`)
  if (DRY) return
  const t = await hataKotiutus(kohteet)
  console.log(`VALMIS aktiviteetit: ok ${t.ok}, ei kuvaa ${t.eiKuvaa}, eri nimi ${t.eriNimi}, virhe ${t.virhe}`)
}

// ── Vaihe: avaukset ─────────────────────────────────────────────────────────
async function vaiheAvaukset() {
  // data/new-openings.json:n kuvat ovat lainalinkkejä ja tiedosto on
  // committoitu. Kuolleet-vaihe vei osan kuvista varastoon, mutta JSON
  // osoittaa yhä vanhaan osoitteeseen ("orvot") — /api/restaurants lukee
  // avausten kuvan tästä tiedostosta, ei venue_ratingsista. Korjaus:
  // varastossa oleva otetaan käyttöön, muut ladataan tai haetaan tuoreena.
  const polku = 'data/new-openings.json'
  const file = JSON.parse(readFileSync(polku, 'utf8')) as {
    openings: { name: string; address?: string | null; image: string | null }[]
  } & Record<string, unknown>
  const kohteet = file.openings.filter((o) => o.image && !onOmassaVarastossa(o.image))
  console.log(`avaukset: ${kohteet.length} kotiutettavaa (haku vain jos lataus ei onnistu → enintään ${(kohteet.length * HINTA_PER_HAKU).toFixed(2)} $)`)
  if (DRY) return
  let varastosta = 0, ladattu = 0, haettu = 0, virhe = 0
  for (const o of kohteet.slice(0, RAJA)) {
    const avain = o.name.toLowerCase().trim()
    try {
      // 1) Kuva voi olla varastossa jo (kuolleet-vaihe vei orpojen kuvat).
      const arvaus = varastoOsoite(avain)
      if (arvaus && (await fetch(arvaus, { method: 'HEAD' })).ok) {
        o.image = arvaus; varastosta++; continue
      }
      // 2) Yritä ladata nykyinen osoite — voi vielä elää.
      try {
        o.image = await kotiutaKuvaTaiHeita(avain, o.image!)
        ladattu++; continue
      } catch { /* kuollut → haetaan tuore */ }
      // 3) Tuore kuva DataForSEOsta, sama nimivartija kuin muissa vaiheissa.
      const biz = await lookupWithRetry(o.address ? `${o.name} ${o.address}` : `${o.name} Helsinki`)
      if (!biz?.found) { tila.virheet[`avaus:${avain}`] = 'ei löytynyt googlesta'; virhe++; continue }
      if (nameOverlap(o.name, biz.title ?? '') < 0.5) { tila.virheet[`avaus:${avain}`] = `eri nimi ("${biz.title}")`; virhe++; continue }
      if (!biz.image) { tila.virheet[`avaus:${avain}`] = 'googlella ei kuvaa'; virhe++; continue }
      o.image = await kotiutaKuvaTaiHeita(avain, biz.image)
      haettu++
    } catch (e) {
      tila.virheet[`avaus:${avain}`] = (e as Error).message; virhe++
    }
    tallennaTila()
  }
  writeFileSync(polku, JSON.stringify(file, null, 2) + '\n')
  console.log(`VALMIS avaukset: varastosta ${varastosta}, ladattu ${ladattu}, haettu tuoreena ${haettu}, virhe ${virhe} — ${polku} kirjoitettu`)
}

;(async () => {
  if (VAIHE === 'elavat') await vaiheElavat()
  else if (VAIHE === 'kuolleet') await vaiheKuolleet()
  else if (VAIHE === 'aktiviteetit') await vaiheAktiviteetit()
  else if (VAIHE === 'avaukset') await vaiheAvaukset()
  else { console.error('anna --vaihe elavat|kuolleet|aktiviteetit|avaukset'); process.exit(1) }
})()
