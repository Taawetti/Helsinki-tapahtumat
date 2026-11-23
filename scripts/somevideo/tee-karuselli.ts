// Instagram-karuselli kuratoidusta listasta (esim. "Joulukuun 10 parasta menoa").
//
//   npx tsx scripts/somevideo/tee-karuselli.ts ~/Documents/MitaTanaan-Somevideot/2026-12-joulukuu-karuselli
//
// Kansiossa: karuselli.json (tekstit, päivät, kuvatiedostot) ja _kuvat/.
// Tulos samaan kansioon: 01-kansi.png, 02…-dia.png, NN-loppu.png (1080×1350).
// Lista on käsin valittu ja jokainen tapahtuma tarkistettu järjestäjän sivulta,
// koska kuukauden lista elää viikkoja: datan väliaikainen virhe näkyisi koko ajan.
import { createServer } from 'node:http'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const JUURI = path.resolve(__dirname, '../..')
const kansio = process.argv[2]
if (!kansio) { console.error('Anna kansio, jossa karuselli.json ja _kuvat/'); process.exit(1) }

async function main() {
  const spec = JSON.parse(await readFile(path.join(kansio, 'karuselli.json'), 'utf8'))
  const tyypit: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
  const palvelin = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (req.method === 'POST' && url.pathname.startsWith('/tulos/')) {
        const nimi = url.pathname.slice('/tulos/'.length)
        if (!/^[a-z0-9.-]+$/.test(nimi)) { res.statusCode = 400; return res.end() }
        const osat: Buffer[] = []
        for await (const c of req) osat.push(c as Buffer)
        const kohde = path.join(kansio, nimi)
        await writeFile(kohde + '.osa', Buffer.concat(osat))
        await rename(kohde + '.osa', kohde)
        return res.end('ok')
      }
      if (url.pathname === '/') { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(await readFile(path.join(__dirname, 'karuselli.html'))) }
      if (url.pathname === '/ikoni.png') { res.setHeader('content-type', 'image/png'); return res.end(await readFile(path.join(JUURI, 'public/icon-512.png'))) }
      const m = url.pathname.match(/^\/kuvat\/([^/]+)$/)
      if (m) {
        const nimi = decodeURIComponent(m[1])
        if (nimi.includes('..') || nimi.includes('/')) { res.statusCode = 400; return res.end() }
        res.setHeader('content-type', tyypit[path.extname(nimi).toLowerCase()] ?? 'application/octet-stream')
        return res.end(await readFile(path.join(kansio, '_kuvat', nimi)))
      }
      res.statusCode = 404; res.end()
    } catch (e) { res.statusCode = 500; res.end(String(e)) }
  })
  await new Promise<void>((ok) => palvelin.listen(0, '127.0.0.1', ok))
  const portti = (palvelin.address() as AddressInfo).port
  await mkdir(kansio, { recursive: true })
  const selain = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--no-default-browser-check'] })
  try {
    const sivu = await selain.newPage()
    sivu.on('pageerror', (e) => console.error('[pohja]', e))
    await sivu.goto(`http://localhost:${portti}/`, { waitUntil: 'networkidle0' })
    await sivu.waitForFunction('window.pohjaValmis === true')
    const n = await sivu.evaluate((s) => (window as unknown as { renderoi: (s: unknown) => Promise<number> }).renderoi(s), spec)
    console.log(`Valmis: ${n} diaa → ${kansio}`)
  } finally {
    await selain.close()
    palvelin.close()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
