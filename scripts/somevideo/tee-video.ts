// Somevideo: illan 5 nostoa (TikTok/Reels, 9:16, ~17 s, ilman ääntä).
//
//   npm run somevideo -- 2026-11-19            → ~/Documents/MitaTanaan-Somevideot/2026-11-19-torstai/
//   npm run somevideo -- 2026-11-19 --ruudut   → lisäksi pysäytyskuvat tarkistusta varten
//   --lahde http://localhost:3000              → muu datalähde kuin tuotanto
//
// VALINTA ON SAMA KUIN ETUSIVUN "✦ ILLAN NOSTOT": valitseHero (lib/picks)
// päivän tapahtumista, sama /api/events-haku kuin iltapushilla. Valinnan
// tunnisteet tallennetaan valinta.json-tiedostoon, jotta videon linkkisivu voi
// näyttää täsmälleen samat viisi, vaikka lähteet päivittyisivät päivän aikana.
//
// TEKSTIT TULEVAT AINA DATASTA KOODILLA. Mitään ei kirjoita tekoäly. Pohja
// (pohja.html) vain asettelee sille annetut merkkijonot.
//
// Video piirretään Chromessa (koneen oma, puppeteer-core) ruutu kerrallaan ja
// pakataan H.264:ksi WebCodecsilla (mediabunny). Ei ffmpegiä. WebCodecs vaatii
// suojatun sivun, joten pohja tarjoillaan localhostista eikä file://-osoitteesta.

import { createServer } from 'node:http'
import { mkdtemp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import sharp from 'sharp'
import puppeteer from 'puppeteer-core'
import { valitseHero } from '@/lib/picks'
import { helsinkiOsat, paivaOtsikkoPitka } from '@/lib/helsinki-time'
import { paikanInstagram } from '@/lib/paikkojen-instagram'
import { sovellaTapahtumakorjaukset, poistaPiilotetut, type TapahtumakorjausTiedosto } from '@/lib/tapahtumakorjaukset'
import korjausTiedosto from '@/data/tapahtumakorjaukset.json'
import type { Event } from '@/lib/types'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const JUURI = path.resolve(__dirname, '../..')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0 Safari/537.36'

const args = process.argv.slice(2)
const paiva = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))
const lahdeIdx = args.indexOf('--lahde')
const LAHDE = lahdeIdx >= 0 ? args[lahdeIdx + 1] : 'https://mitatanaan.fi'
const RUUDUT = args.some((a) => a === '--ruudut' || a.startsWith('--ruudut='))
// --pois=REGEX: otsikot, jotka jätetään pois TÄSTÄ videosta (esim. kahden illan
// festivaali, joka näytetään vain toisen päivän videossa).
const POIS = args.find((a) => a.startsWith('--pois='))?.slice('--pois='.length)
// --jarjestys="Vesta|Rantala|Röyhkä": videon järjestys otsikon osien mukaan
// (oletus alkamisaika). Vain video; etusivu pysyy aikajärjestyksessä.
const JARJESTYS = args.find((a) => a.startsWith('--jarjestys='))?.slice('--jarjestys='.length).split('|').map((x) => x.trim().toLowerCase()).filter(Boolean)
// --aika="Röyhkä=20.00|Toinen=21.30": videon ja saatteen kellonaika otsikon osan
// mukaan, kun lähteen aika on ovien aukeaminen eikä esityksen alku (Tavastia
// 19.11.2026: ovet 19.00, Röyhkä lavalla 20.00). Vain video; sovellus ei muutu.
const AJAT = (args.find((a) => a.startsWith('--aika='))?.slice('--aika='.length) ?? '')
  .split('|').map((x) => x.split('=')).filter((x) => x.length === 2 && /^\d{1,2}[.:]\d{2}$/.test(x[1].trim()))
  .map(([o, k]) => ({ osa: o.trim().toLowerCase(), klo: k.trim().replace(':', '.').padStart(5, '0') }))
// --avaus=KANSIO: oikea videopätkä koukuksi (JPG-ruudut 30 fps, 000.jpg…).
// Koukkuteksti kuvan päälle (--koukku="Rivi 1|Rivi 2"), ei erillistä otsikko-
// korttia, nopeampi tahti ja lyhyet otsikot. TikTok 19.11.2026: keskim.
// katseluaika 2,0 s eli katsojat lähtivät ennen ensimmäistä tapahtumaa.
const AVAUS = args.find((a) => a.startsWith('--avaus='))?.slice('--avaus='.length)
const KOUKKU = args.find((a) => a.startsWith('--koukku='))?.slice('--koukku='.length).split('|').map((x) => x.trim()).filter(Boolean)
// --versio=v2: tulos omaan kansioonsa, aiempi video jää ennalleen.
const VERSIO = args.find((a) => a.startsWith('--versio='))?.slice('--versio='.length).replace(/[^a-z0-9-]/gi, '')
// --loppuunmyyty="Viki|Toinen": "Loppuunmyyty"-merkintä otsikon osan mukaan.
const LOPPUUNMYYTY = (args.find((a) => a.startsWith('--loppuunmyyty='))?.slice('--loppuunmyyty='.length) ?? '').split('|').map((x) => x.trim().toLowerCase()).filter(Boolean)
// --kansi="Viki": tämän tapahtuman kuva alun ensimmäiseksi ja kansikuvaan.
// Ensimmäinen ruutu on myös se, jonka TikTokin kansivalitsin näyttää alussa.
const KANSI = args.find((a) => a.startsWith('--kansi='))?.slice('--kansi='.length).trim().toLowerCase()
// --suora: ei otsikkoruutua. Video alkaa suoraan ensimmäisen tapahtuman kuvasta,
// ja koukkuteksti (--koukku) näkyy sen päällä ensimmäisen sekunnin. TikTok
// 19.–20.11.2026: otsikkoruudulla keskim. katseluaika 2,0 s ja 1,7 s.
const SUORA = args.includes('--suora')
// --otsikko="Suurten laulujen=Tarja Turunen & Jarkko Ahola": kortin otsikko otsikon
// osan mukaan, kun lähteen nimi ei kerro pääesiintyjää. Vain video.
const OTSIKOT = (args.find((a) => a.startsWith('--otsikko='))?.slice('--otsikko='.length) ?? '')
  .split('|').map((x) => x.split('=')).filter((x) => x.length === 2 && x[1].trim())
  .map(([o, u]) => ({ osa: o.trim().toLowerCase(), uusi: u.trim() }))
if (!paiva) {
  console.error('Anna päivä: npm run somevideo -- 2026-11-19')
  process.exit(1)
}

const kaksi = (n: number) => String(n).padStart(2, '0')

/** "torstai 19. marraskuuta" → "torstai" (lib/helsinki-time:n kiinteä nimitaulukko). */
const viikonpaiva = (iso: string) => paivaOtsikkoPitka(iso).split(' ')[0]
const isoAlku = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Klo-merkintä, tai null kun lähde ei tiedä kellonaikaa (startTimeApprox:
 *  kiinteä oletus kuten "T19:00") tai rivi on pelkkä päivämäärä. Väärä
 *  kellonaika videolla olisi pahempi kuin puuttuva.
 *  Myös minuutti, joka ei ole viidellä jaollinen, on lähteen täyteaika eikä
 *  alkamisaika: MyHelsingin monipäiväinen Finlandia Trophy 19.–21.11.2026 tuli
 *  muodossa 22.01–21.59. Oikeat alkamisajat ovat tasavartteja ja viiden välein. */
function kello(e: Event): string | null {
  const kasin = AJAT.find((a) => e.title.toLowerCase().includes(a.osa))
  if (kasin) return `klo ${kasin.klo}`
  if (e.startTimeApprox || !e.startTime.includes('T')) return null
  const o = helsinkiOsat(e.startTime)
  if (!o || o.minuutti % 5 !== 0) return null
  return `klo ${kaksi(o.tunti)}.${kaksi(o.minuutti)}`
}

/** Lähteen katkaisema otsikko ("…Age...") → typografinen ellipsi. */
const siistiOtsikko = (t: string) => t.trim().replace(/\s*\.\.\.$/, '…').replace(/\s+/g, ' ')

/** Kortin lyhyt otsikko, joka ehtii lukea alle kahdessa sekunnissa:
 *  "Finlandia Trophy Helsinki - Taitoluistelun GP-osakilpailu" → "Finlandia
 *  Trophy Helsinki", "Timo Pieni Huijaus (levyjulkkarit), Tiia Karoliina" →
 *  "Timo Pieni Huijaus". Saate pitää koko otsikon. */
function lyhytOtsikko(t: string): string {
  let s = siistiOtsikko(t).replace(/\s*\([^)]*\)/g, '')
  s = s.split(/\s+[-–—]\s+/)[0]
  if (s.includes(', ')) s = s.split(', ')[0]
  return s.trim() || siistiOtsikko(t)
}

async function haeTapahtumat(pvm: string): Promise<Event[]> {
  const p = new URLSearchParams({ start: pvm, end: pvm, page: '1', municipality: 'helsinki' })
  const r = await fetch(`${LAHDE}/api/events?${p}`, { signal: AbortSignal.timeout(90_000) })
  if (!r.ok) throw new Error(`/api/events HTTP ${r.status}`)
  const d = await r.json()
  if (d.hasMore) console.warn('Huom: /api/events palautti hasMore=true — päivän lista voi olla vajaa.')
  return (d.events ?? []) as Event[]
}

/** Lataa kuvan ja tekee siitä kortin (terävä) ja taustan (sumennettu, tumma).
 *  null, jos kuvaa ei saada — pohja piirtää silloin liukuvärin kuten hero. */
/** Värikkyys (Hasler & Süsstrunk 2003) 64×64-pienennöksestä. Koukun ensimmäinen
 *  ruutu on syötteen pysäytyskuva: värikäs kuva pysäyttää peukalon paremmin
 *  kuin tumma juliste, joten koukku alkaa illan värikkäimmästä kuvasta. */
async function varikkyys(raaka: Buffer): Promise<number> {
  const { data } = await sharp(raaka).rotate().removeAlpha().resize(64, 64, { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true })
  const rg: number[] = [], yb: number[] = []
  for (let i = 0; i < data.length; i += 3) {
    rg.push(data[i] - data[i + 1])
    yb.push((data[i] + data[i + 1]) / 2 - data[i + 2])
  }
  const ka = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  const kh = (a: number[], m: number) => Math.sqrt(ka(a.map((x) => (x - m) ** 2)))
  const mrg = ka(rg), myb = ka(yb)
  return Math.hypot(kh(rg, mrg), kh(yb, myb)) + 0.3 * Math.hypot(mrg, myb)
}

async function valmisteleKuva(url: string, kansio: string, i: number): Promise<{ kuva: string; tausta: string; varikkyys: number } | null> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const raaka = Buffer.from(await r.arrayBuffer())
    const pohja = sharp(raaka).rotate().flatten({ background: '#0a0a0f' })
    await pohja.clone()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toFile(path.join(kansio, `k${i}.jpg`))
    await pohja.clone()
      .resize(216, 384, { fit: 'cover' })
      .blur(5)
      .modulate({ brightness: 0.6, saturation: 1.25 })
      .jpeg({ quality: 90 })
      .toFile(path.join(kansio, `t${i}.jpg`))
    return { kuva: `/kuvat/k${i}.jpg`, tausta: `/kuvat/t${i}.jpg`, varikkyys: await varikkyys(raaka) }
  } catch (e) {
    console.warn(`Kuva ${i + 1} ei latautunut (${(e as Error).message}): ${url}`)
    return null
  }
}

/** Saate: numeroitu lista ja paikan @-tili, kun se on tarkistettu
 *  (lib/paikkojen-instagram). Tuntematonta tiliä ei arvata. */
function saate(otsikko: string, nostot: Event[]): string {
  const rivit = nostot.map((e, i) => {
    const tili = paikanInstagram(e.location?.name)
    const loppuun = LOPPUUNMYYTY.some((x) => e.title.toLowerCase().includes(x)) ? 'loppuunmyyty' : null
    const osat = [siistiOtsikko(e.title), e.location?.name, kello(e), loppuun].filter(Boolean)
    return `${i + 1}. ${osat.join(' · ')}${tili ? ` @${tili}` : ''}`
  })
  // Hashtagit 19.11.2026: #helsinkitapahtumat (2 julkaisua) ja #mitätänään
  // (0) eivät tuo katsojia; tilalle tunnisteet, joilla on yleisöä.
  return [
    `${otsikko} ✦`,
    '',
    ...rivit,
    '',
    'Mihin sä meet tänään?',
    '',
    'Liput ja kaikki Helsingin menot: mitatanaan.fi (linkki profiilissa)',
    '',
    '#helsinki #helsinkifinland #keikka #menovinkit #stadi',
    '',
  ].join('\n')
}

async function main() {
  const pvmIso = `${paiva}T12:00:00+02:00`
  const vp = viikonpaiva(pvmIso)
  const o = helsinkiOsat(pvmIso)!
  const kansio = path.join(homedir(), 'Documents', 'MitaTanaan-Somevideot', `${paiva}-${vp}${VERSIO ? '-' + VERSIO : ''}`)
  await mkdir(kansio, { recursive: true })

  console.log(`Haetaan ${paiva} (${vp}) lähteestä ${LAHDE}…`)
  // Samat käsin tehdyt korjaukset kuin etusivulla (data/tapahtumakorjaukset.json:
  // illanNosto, eiIllanNostoihin, otsikko, kuva, lippulinkki). Koneen oma
  // tiedosto, jotta video ei odota deployta; tuotannon kooste tekee saman.
  const korjaukset = (korjausTiedosto as TapahtumakorjausTiedosto).korjaukset
  // Tuotannon kooste on jo soveltanut DEPLOYATUN tiedoston nostomerkinnät.
  // Ne riisutaan ensin, jotta tämän koneen tiedosto ratkaisee (muuten käsin
  // nostosta poistettu tapahtuma jäisi videoon kunnes muutos on deployattu).
  const haetut = (await haeTapahtumat(paiva!)).map((e) => {
    const r = { ...e }
    delete r.illanNosto
    delete r.eiIllanNostoihin
    return r
  })
  const kaikki = poistaPiilotetut(sovellaTapahtumakorjaukset(haetut, korjaukset), korjaukset)

  // EI TOISTOA PERÄKKÄISISSÄ VIDEOISSA (omistaja 19.11.2026): edellisen päivän
  // videossa ollut tapahtuma (sama otsikko + paikka) jää pois. Etusivu näyttää
  // kahden illan tapahtuman molempina päivinä; tämä koskee vain videoita.
  const avain = (t: string, v: string | null | undefined) => `${t.toLowerCase().replace(/[^a-z0-9åäö]+/g, ' ').trim()}|${(v ?? '').toLowerCase()}`
  const eilen = new Date(`${paiva}T12:00:00Z`); eilen.setUTCDate(eilen.getUTCDate() - 1)
  const eilenIso = eilen.toISOString().slice(0, 10)
  const eilisenKansio = path.join(homedir(), 'Documents', 'MitaTanaan-Somevideot', `${eilenIso}-${viikonpaiva(`${eilenIso}T12:00:00+02:00`)}`)
  const eilisen = new Set<string>()
  try {
    const v = JSON.parse(await readFile(path.join(eilisenKansio, 'valinta.json'), 'utf8')) as { tapahtumat: { title: string; venue: string | null }[] }
    for (const t of v.tapahtumat) eilisen.add(avain(t.title, t.venue))
  } catch { /* ei eilistä videota */ }
  const poisRe = POIS ? new RegExp(POIS, 'i') : null
  const tapahtumat = kaikki.filter((e) => {
    if (eilisen.has(avain(e.title, e.location?.name))) { console.log(`Pois (eilisessä videossa): ${e.title}`); return false }
    if (poisRe?.test(e.title)) { console.log(`Pois (--pois): ${e.title}`); return false }
    return true
  })
  const nostot = valitseHero(tapahtumat, 5)
  if (JARJESTYS?.length) {
    const sija = (e: Event) => { const i = JARJESTYS.findIndex((j) => e.title.toLowerCase().includes(j)); return i < 0 ? JARJESTYS.length : i }
    for (const j of JARJESTYS) if (!nostot.some((e) => e.title.toLowerCase().includes(j))) console.warn(`Huom: --jarjestys "${j}" ei osu yhteenkään nostoon`)
    nostot.sort((a, b) => sija(a) - sija(b))
  }
  console.log(`${tapahtumat.length} tapahtumaa → ${nostot.length} nostoa`)
  if (nostot.length === 0) throw new Error('Ei nostoja tälle päivälle')

  const tyo = await mkdtemp(path.join(tmpdir(), 'somevideo-'))
  try {
    const kuvat = await Promise.all(nostot.map((e, i) => (e.image ? valmisteleKuva(e.image, tyo, i) : Promise.resolve(null))))

    // Saatteen ensimmäinen rivi toistaa koukun: haku lukee myös saatteen.
    const iltaOtsikko = (AVAUS || SUORA) && KOUKKU?.length
      ? `${KOUKKU.join(' ').replace(/\s*↓/g, '').trim()} – ${isoAlku(vp)} ${o.paiva}.${o.kuukausi}. – mitä tehdä Helsingissä tänään, ${nostot.length} vinkkiä`
      : `Mitä tänään? ${isoAlku(vp)} ${o.paiva}.${o.kuukausi}. – mitä tehdä Helsingissä tänään, ${nostot.length} vinkkiä`
    const avausRuudut = AVAUS ? (await readdir(AVAUS)).filter((f) => /^\d{3}\.jpg$/.test(f)).sort() : []
    if (AVAUS && avausRuudut.length === 0) throw new Error(`--avaus: kansiossa ${AVAUS} ei ole ruutuja 000.jpg…`)
    // Tiivis tahti avauspätkän kanssa: 1,5 s pätkä + 5 × 1,9 s + 1,3 s ≈ 12 s.
    // --kohde=1.5: kortin kesto sekunteina (omistaja 20.11.2026: 1,9 s tuntui pitkältä).
    const kohdeArg = Number(args.find((a) => a.startsWith('--kohde='))?.slice('--kohde='.length))
    const tahti = AVAUS || SUORA ? { kohde: kohdeArg > 0.8 ? kohdeArg : 1.9, loppu: SUORA ? 1.2 : 1.3 } : { kohde: kohdeArg > 0.8 ? kohdeArg : 2.8, loppu: 1.8 }
    const spec = {
      tahti,
      // Kansikuva hetkestä, jolloin alun ensimmäinen kuva näkyy (vaihto 0,24 s välein).
      kansiT: SUORA ? 0.4 : KANSI ? 0.12 : undefined,
      // Päivä omana isona tarranaan (omistaja 21.11.2026: pitää näkyä selvästi, että kyse on tästä päivästä).
      suora: SUORA ? { pieni: '✦ Mitä tänään?', paiva: `${vp.toUpperCase()} ${o.paiva}.${o.kuukausi}.`, koukku: KOUKKU?.length ? KOUKKU : [`${nostot.length} menoa Helsingissä`, 'tänään ↓'], kesto: 0.7 } : null,
      avaus: AVAUS ? { ruutuja: avausRuudut.length, pieni: `✦ MITÄ TÄNÄÄN? · ${vp.toUpperCase()} ${o.paiva}.${o.kuukausi}.`, koukku: KOUKKU?.length ? KOUKKU : ['Mitä tänään?'], ala: `${nostot.length} menovinkkiä Helsingissä ↓` } : null,
      // Koukku on sovelluksen nimi, sama joka videossa (toistuva tunnus).
      // Hakusana "mitä tehdä Helsingissä" on saatteen ensimmäisellä rivillä.
      // Päivämäärä pitää "tänään"-sanan rehellisenä, vaikka video nähtäisiin myöhemmin.
      intro: {
        pieni: `HELSINKI · ${vp.toUpperCase()} ${o.paiva}.${o.kuukausi}.`,
        koukku: ['✦ Mitä', 'tänään?'],
        korosta: '✦?',
        ala: `${nostot.length} menovinkkiä tänään ↓`,
        // Kuvien järjestys koukussa: värikkäin ensin (indeksit kohteisiin).
        jarjestys: (() => {
          const j = kuvat.map((k, i) => ({ i, v: k?.varikkyys ?? -1 })).filter((x) => x.v >= 0).sort((a, b) => b.v - a.v).map((x) => x.i)
          const k = KANSI ? nostot.findIndex((e, i) => e.title.toLowerCase().includes(KANSI) && j.includes(i)) : -1
          if (KANSI && k < 0) console.warn(`Huom: --kansi "${KANSI}" ei osu kuvalliseen nostoon`)
          return k >= 0 ? [k, ...j.filter((x) => x !== k)] : j
        })(),
      },
      kohteet: nostot.map((e, i) => ({
        // Lyhyt otsikko aina, kun kortti näkyy alle 2,5 s: pitkää ei ehdi lukea.
        otsikko: OTSIKOT.find((x) => e.title.toLowerCase().includes(x.osa))?.uusi ?? (AVAUS || tahti.kohde < 2.5 ? lyhytOtsikko(e.title) : siistiOtsikko(e.title)),
        loppuunmyyty: LOPPUUNMYYTY.some((x) => e.title.toLowerCase().includes(x)),
        paikka: e.location?.name ?? '',
        aika: kello(e),
        ilmainen: e.isFree,
        kuva: kuvat[i]?.kuva ?? null,
        tausta: kuvat[i]?.tausta ?? null,
      })),
      // Ei "tämän päivän": katsoja luulisi sivun kertovan vain tästä päivästä.
      loppuYla: 'Kaikki Helsingin menot',
      loppu: 'mitatanaan.fi',
    }

    const bundle = path.join(JUURI, 'node_modules/mediabunny/dist/bundles/mediabunny.min.cjs')
    const palvelin = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (req.method === 'POST' && url.pathname.startsWith('/tulos/')) {
          const nimi = url.pathname.slice('/tulos/'.length)
          if (!/^[a-z0-9.-]+$/.test(nimi)) { res.statusCode = 400; return res.end() }
          const osat: Buffer[] = []
          for await (const c of req) osat.push(c as Buffer)
          const kohde = nimi.startsWith('ruutu-') ? path.join(kansio, '_ruudut', nimi) : path.join(kansio, nimi)
          await mkdir(path.dirname(kohde), { recursive: true })
          // Kirjoitus väliaikaiseen nimeen ja vaihto: jos edellinen video on auki
          // QuickTimessa, sen päälle kirjoittaminen jättäisi soittimen rikkinäiseen tilaan.
          await writeFile(kohde + '.osa', Buffer.concat(osat))
          await rename(kohde + '.osa', kohde)
          return res.end('ok')
        }
        const tiedostot: Record<string, [string, string]> = {
          '/': [path.join(__dirname, 'pohja.html'), 'text/html; charset=utf-8'],
          '/mediabunny.js': [bundle, 'text/javascript'],
          '/ikoni.png': [path.join(JUURI, 'public/icon-512.png'), 'image/png'],
        }
        let t = tiedostot[url.pathname]
        const avausRuutu = url.pathname.match(/^\/avaus\/(\d{3}\.jpg)$/)
        if (avausRuutu && AVAUS) t = [path.join(AVAUS, avausRuutu[1]), 'image/jpeg']
        const kuva = url.pathname.match(/^\/kuvat\/([kt]\d\.jpg)$/)
        if (kuva) t = [path.join(tyo, kuva[1]), 'image/jpeg']
        if (!t) { res.statusCode = 404; return res.end() }
        res.setHeader('content-type', t[1])
        res.end(await readFile(t[0]))
      } catch (e) {
        res.statusCode = 500
        res.end(String(e))
      }
    })
    await new Promise<void>((ok) => palvelin.listen(0, '127.0.0.1', ok))
    const portti = (palvelin.address() as AddressInfo).port

    const selain = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--no-default-browser-check'] })
    try {
      const sivu = await selain.newPage()
      sivu.on('console', (m) => { if (m.type() === 'error') console.error('[pohja]', m.text()) })
      sivu.on('pageerror', (e) => console.error('[pohja]', e))
      await sivu.goto(`http://localhost:${portti}/`, { waitUntil: 'networkidle0' })
      await sivu.waitForFunction('window.pohjaValmis === true')
      const t0 = Date.now()
      // Pysäytyskuvat: alkukortti, jokaisen kortin keskikohta ja loppukortti.
      // --ruudut=2.6,17.6 ottaa kuvat annetuista ajankohdista (sekunteina).
      const omat = args.find((a) => a.startsWith('--ruudut='))?.slice('--ruudut='.length).split(',').map(Number).filter((n) => n >= 0)
      const intro = AVAUS ? avausRuudut.length / 30 : SUORA ? 0 : 1.2
      const ruudut = omat?.length ? omat : RUUDUT ? [0, 0.6, ...nostot.map((_, i) => intro + i * tahti.kohde + tahti.kohde / 2), intro + nostot.length * tahti.kohde + tahti.loppu * 0.7] : []
      const tulos = await sivu.evaluate((s, r) => (window as unknown as { renderoi: (s: unknown, r: number[]) => Promise<{ ruutuja: number; kesto: number }> }).renderoi(s, r), spec, ruudut)
      console.log(`Video: ${tulos.ruutuja} ruutua, ${tulos.kesto} s, piirto ${((Date.now() - t0) / 1000).toFixed(1)} s`)
    } finally {
      await selain.close()
      palvelin.close()
    }

    await writeFile(path.join(kansio, 'saate.txt'), saate(iltaOtsikko, nostot))
    const ilmanTilia = nostot.filter((e) => !paikanInstagram(e.location?.name)).map((e) => e.location?.name ?? '(ei paikkaa)')
    if (ilmanTilia.length) console.log(`Ilman Instagram-merkintää: ${ilmanTilia.join(', ')} (lisää lib/paikkojen-instagram.ts, kun tili on tarkistettu)`)
    await writeFile(path.join(kansio, 'valinta.json'), JSON.stringify({
      paiva,
      luotu: new Date().toISOString(),
      lahde: LAHDE,
      tapahtumat: nostot.map((e) => ({
        id: e.id, title: e.title, venue: e.location?.name ?? null, startTime: e.startTime,
        ticketUrl: e.ticketUrl, infoUrl: e.infoUrl, image: e.image, isFree: e.isFree,
      })),
    }, null, 2) + '\n')
    console.log(`Valmis: ${kansio}`)
  } finally {
    await rm(tyo, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
