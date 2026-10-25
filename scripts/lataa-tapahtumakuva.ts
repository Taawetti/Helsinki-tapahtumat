// Lataa tapahtuman kuvan Supabase Storagen julkiseen event-images-buckettiin
// (sama bucket kuin Ilmoita tapahtuma -lomakkeen kuvilla) ja tulostaa julkisen
// osoitteen data/tapahtumakorjaukset.json:ia varten.
//
//     node --env-file=.env.local --import tsx scripts/lataa-tapahtumakuva.ts <tiedosto> <nimi>
//
// Nimi annetaan käsin ja kuvaavana (esim. jannan-joulu-kallion-kirkko-2026-12-09),
// jotta sama tapahtuma päätyy aina samaan tiedostoon ja uusi lataus korvaa
// vanhan (x-upsert). Sallitut: jpg, png, webp, enintään 5 Mt. Kuvaa ei muokata:
// juliste ladataan sellaisena kuin omistaja sen toimitti.
import { readFileSync, statSync } from 'node:fs'
import { extname, basename } from 'node:path'

const BUCKET = 'event-images'
const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

async function main() {
  const [tiedosto, nimi] = process.argv.slice(2)
  if (!tiedosto || !nimi || !/^[a-z0-9-]+$/.test(nimi)) {
    console.error('käyttö: lataa-tapahtumakuva.ts <tiedosto> <nimi: a-z, 0-9 ja viiva>')
    process.exit(2)
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL tai SUPABASE_SERVICE_ROLE_KEY puuttuu')
  const pate = extname(tiedosto).toLowerCase()
  const mime = MIME[pate]
  if (!mime) throw new Error(`tuntematon kuvatyyppi ${pate || '(ei päätettä)'}`)
  const koko = statSync(tiedosto).size
  if (koko > 5 * 1024 * 1024) throw new Error(`liian suuri: ${Math.round(koko / 1024)} kt > 5 Mt`)

  const polku = `${nimi}${pate === '.jpeg' ? '.jpg' : pate}`
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${polku}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': mime, 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
    body: readFileSync(tiedosto),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`lataus ${res.status}: ${(await res.text()).slice(0, 160)}`)

  const julkinen = `${url}/storage/v1/object/public/${BUCKET}/${polku}`
  const tarkistus = await fetch(julkinen, { method: 'HEAD', signal: AbortSignal.timeout(20_000) })
  if (!tarkistus.ok) throw new Error(`julkinen osoite ei vastaa: HTTP ${tarkistus.status}`)
  console.log(`ladattu ${basename(tiedosto)} (${Math.round(koko / 1024)} kt, ${tarkistus.headers.get('content-type')})`)
  console.log(julkinen)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
