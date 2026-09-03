// Ravintolakuvien KOTIUTUS — kuvat omaan varastoon, jotta ne eivät vanhene.
//
// TAUSTA (mitattu 3.9.2026): rikastuksen tallentamat Googlen kuvaosoitteet
// (lh3.googleusercontent.com/gps-cs-s/…) vanhenevat viikoissa — otos 40/40
// palautti 403. Korteista vain ~640/3 611:llä oli aidosti toimiva kuva.
// Uudelleenrikastus olisi juoksumatto: tuoreet osoitteet vanhenisivat taas.
// Ratkaisu: lataa kuva KERRAN, pienennä (≤800 px, webp) ja tallenna omaan
// Supabase Storage -bucketiin (venue-images, julkinen) → osoite ei vanhene
// koskaan. venue_ratings.main_image päivitetään osoittamaan omaan varastoon,
// jolloin /api/restaurants toimii ilman koodimuutoksia.
//
// KAKSI VAIHETTA:
//   --vaihe elavat    ILMAINEN: kotiuttaa venue_ratingsin vielä toimivat
//                     kuvaosoitteet (katunäkymät ym. ei-lh3).
//   --vaihe kuolleet  MAKSULLINEN (~0,0054 $/haku): korteille joiden kuva on
//                     kuollut lh3-osoite haetaan tuore kuva DataForSEOsta
//                     (sama my_business_info-putki ja nimivartija kuin
//                     rikastuksessa), ladataan HETI (tuore osoite vanhenee
//                     sekin) ja kotiutetaan.
//   --raja N          käsittele enintään N kohdetta (oletus: kaikki)
//   --dry             älä lataa/kirjoita mitään, näytä vain määrät ja hinta
//
// KESKEYTYKSENKESTÄVÄ: eteneminen kirjataan tilatiedostoon (--tila <polku>),
// ja valmiit ohitetaan uudelleenajossa. Yksittäisen kohteen virhe ei kaada
// ajoa — se kirjataan ja jatketaan.
//
// Ajo: npx tsx scripts/kotiuta-kuvat.ts --vaihe elavat
//      npx tsx scripts/kotiuta-kuvat.ts --vaihe kuolleet --tila <polku>

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { lookupWithRetry, nameOverlap } from '../lib/dataforseo'

// .env.local käsin (skripti ajetaan Nextin ulkopuolella)
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
const BUCKET = 'venue-images'
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
const onOma = (u: string) => u.includes(`/storage/v1/object/public/${BUCKET}/`)

/** Lataa kuva, pienennä ja vie varastoon. Palauttaa julkisen osoitteen. */
async function kotiuta(venueKey: string, kuvaUrl: string): Promise<string> {
  const res = await fetch(kuvaUrl, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`lataus ${res.status}`)
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.startsWith('image/')) throw new Error(`ei kuva (${ct.slice(0, 30)})`)
  const raaka = Buffer.from(await res.arrayBuffer())
  if (raaka.length < 4096) throw new Error(`liian pieni (${raaka.length} t)`)
  // 800 px sisään mahtuvaksi, webp — kortit näyttävät ~400-600 px leveinä,
  // joten tämä riittää verkkokalvonäytöillekin ja pitää varaston pienenä.
  const webp = await sharp(raaka).rotate().resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
  const nimi = `${createHash('sha1').update(venueKey).digest('hex')}.webp`
  const up = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${nimi}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
    body: new Uint8Array(webp),
  })
  if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 80)}`)
  return `${SB_URL}/storage/v1/object/public/${BUCKET}/${nimi}`
}

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
  const kohteet = kaikki.filter((r) => !onLh3(r.main_image) && !onOma(r.main_image) && !valmiit.has(r.venue_key)).slice(0, RAJA)
  console.log(`elävät: ${kohteet.length} kotiutettavaa (yht. ${kaikki.length} main_imagea)`)
  if (DRY) return
  let ok = 0, virhe = 0
  for (const k of kohteet) {
    try {
      const oma = await kotiuta(k.venue_key, k.main_image)
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

// ── Vaihe: kuolleet (maksullinen) ───────────────────────────────────────────
async function vaiheKuolleet() {
  // Kohteet: tuotannon kortit joiden näkyvä kuva on kuollut lh3-osoite.
  // Nimi+osoite tulee korteista (sama kysely kuin alkuperäisessä
  // rikastuksessa); venue_key on API:n käyttämä nimipohjainen avain.
  const res = await fetch('https://mitatanaan.fi/api/restaurants')
  const data = (await res.json()) as { restaurants: { name: string; address?: string; image?: string | null }[] }
  const kohteetRaw = data.restaurants.filter((r) => r.image && onLh3(r.image))
  // Ketjut jakavat venue_keyn — kotiutus kerran per avain riittää, koska
  // kortitkin jakavat saman main_imagen.
  const nahty = new Set<string>()
  const kohteet = kohteetRaw.filter((r) => {
    const k = r.name.toLowerCase().trim()
    if (nahty.has(k) || valmiit.has(k)) return false
    nahty.add(k); return true
  }).slice(0, RAJA)
  console.log(`kuolleet: ${kohteet.length} hakua → hinta-arvio ${(kohteet.length * HINTA_PER_HAKU).toFixed(2)} $`)
  if (DRY) return

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
    await Promise.all(aalto.map(async (r) => {
      const avain = r.name.toLowerCase().trim()
      try {
        const q = r.address ? `${r.name} ${r.address} Helsinki` : `${r.name} Helsinki`
        // lookupWithRetry uusii vain TYHJÄT vastaukset; teknisen virheen
        // (null: HTTP-virhe, aikakatkaisu) uusinta hoidetaan tässä.
        let biz = null
        for (let y = 0; y < 3 && !biz; y++) {
          if (y > 0) await new Promise((s) => setTimeout(s, 5000))
          biz = await lookupWithRetry(q)
        }
        if (!biz) { tila.virheet[avain] = 'tekninen virhe (3 yritystä)'; virhe++; peräkkäisetTekniset++; return }
        peräkkäisetTekniset = 0
        if (!biz.found) { tila.virheet[avain] = 'ei löytynyt googlesta'; virhe++; return }
        // Sama nimivartija kuin enrich-new-places: väärä paikka on pahempi
        // kuin puuttuva kuva.
        if (nameOverlap(r.name, biz.title ?? '') < 0.5) { tila.virheet[avain] = `eri nimi ("${biz.title}")`; eriNimi++; return }
        if (!biz.image) { tila.virheet[avain] = 'googlella ei kuvaa'; eiKuvaa++; return }
        // Lataus HETI — tuore osoite vanhenee sekin.
        const oma = await kotiuta(avain, biz.image)
        await paivitaMainImage(avain, oma)
        tila.valmiit.push(avain); valmiit.add(avain)
        delete tila.virheet[avain]; ok++
      } catch (e) {
        tila.virheet[avain] = (e as Error).message; virhe++
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
  console.log(`VALMIS kuolleet: ok ${ok}, ei kuvaa ${eiKuvaa}, eri nimi ${eriNimi}, virhe ${virhe}`)
}

;(async () => {
  if (VAIHE === 'elavat') await vaiheElavat()
  else if (VAIHE === 'kuolleet') await vaiheKuolleet()
  else { console.error('anna --vaihe elavat|kuolleet'); process.exit(1) }
})()
