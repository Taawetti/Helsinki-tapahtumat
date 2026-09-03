// Kuvavarasto: kuvan KOTIUTUS omaan Supabase Storage -varastoon.
//
// MIKSI. Googlen kuvaosoitteet (lh3.googleusercontent.com) LAHOAVAT — toimivat
// viikkoja ja alkavat sitten palauttaa 403 (mitattu 3.9.2026: otos 40/40
// kuollut). Siksi kuvaa EI saa tallentaa Googlen osoitteena: se pitää ladata
// kerran, pienentää ja viedä omaan julkiseen buckettiin, jonka osoite ei
// vanhene koskaan. Tämä moduuli on ainoa paikka jossa vienti tehdään —
// jokainen kuvia tallentava putki (enrich-restaurants-all, enrich-activities-
// all, fetch-new-openings, enrich-new-places, kotiuta-kuvat) kulkee tästä.
//
// AVAIN → TIEDOSTONIMI: sha1(avain).webp. Avain on sama nimipohjainen
// venue_key jota rikastus käyttää (aktiviteeteilla act:-etuliite), joten
// sama paikka päätyy aina samaan tiedostoon riippumatta siitä mikä putki
// kuvan toi — uusi haku vain korvaa tiedoston (x-upsert).

import { createHash } from 'node:crypto'
import sharp from 'sharp'

export const KUVA_BUCKET = 'venue-images'

/** Onko osoite jo omassa varastossa (kotiutus tarpeeton). */
export function onOmassaVarastossa(url: string): boolean {
  return url.includes(`/storage/v1/object/public/${KUVA_BUCKET}/`)
}

/** Julkinen varasto-osoite jonka avain SAISI — olemassaolo pitää tarkistaa
 *  erikseen (HEAD). Käyttö: "onko tämän paikan kuva jo viety varastoon?" */
export function varastoOsoite(avain: string): string | null {
  // GitHub Actionsissa salaisuuden nimi on SUPABASE_URL (ei NEXT_PUBLIC_).
  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  if (!SB_URL) return null
  return `${SB_URL}/storage/v1/object/public/${KUVA_BUCKET}/${createHash('sha1').update(avain).digest('hex')}.webp`
}

/**
 * Lataa kuva, pienennä (≤800 px, webp q78) ja vie varastoon. Palauttaa
 * pysyvän julkisen osoitteen. HEITTÄÄ virheen syineen (lataus 403, ei kuva,
 * liian pieni…) — käytä tätä kun virhesyyt kirjataan (kotiuta-kuvat.ts).
 * Jo kotiutettu osoite palautetaan sellaisenaan.
 */
export async function kotiutaKuvaTaiHeita(avain: string, kuvaUrl: string): Promise<string> {
  // Env luetaan kutsuhetkellä: skriptit lataavat .env.localin vasta moduulin
  // rungossa, ja reiteillä muuttujat ovat aina valmiina. GitHub Actionsissa
  // osoitteen salaisuus on nimeltään SUPABASE_URL (ei NEXT_PUBLIC_).
  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SB_URL || !SB_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL tai SUPABASE_SERVICE_ROLE_KEY puuttuu')
  if (onOmassaVarastossa(kuvaUrl)) return kuvaUrl

  const res = await fetch(kuvaUrl, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`lataus ${res.status}`)
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.startsWith('image/')) throw new Error(`ei kuva (${ct.slice(0, 30)})`)
  const raaka = Buffer.from(await res.arrayBuffer())
  if (raaka.length < 4096) throw new Error(`liian pieni (${raaka.length} t)`)
  // 800 px sisään mahtuvaksi — kortit näyttävät ~400–600 px leveinä, joten
  // tämä riittää verkkokalvonäytöillekin ja pitää varaston pienenä.
  const webp = await sharp(raaka).rotate().resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
  const nimi = `${createHash('sha1').update(avain).digest('hex')}.webp`
  const up = await fetch(`${SB_URL}/storage/v1/object/${KUVA_BUCKET}/${nimi}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'image/webp',
      'x-upsert': 'true',
    },
    body: new Uint8Array(webp),
  })
  if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 80)}`)
  return `${SB_URL}/storage/v1/object/public/${KUVA_BUCKET}/${nimi}`
}

/**
 * Turvallinen kuori putkille: onnistuessa pysyvä osoite, virheessä null —
 * kutsuja jatkaa alkuperäisellä osoitteella (`?? biz.image`), jolloin kuva
 * näkyy ainakin lainalinkin eliniän ja kotiutus voi pelastaa sen myöhemmin.
 * Kotiutuksen epäonnistuminen ei saa koskaan kaataa rikastusta.
 */
export async function kotiutaKuva(avain: string, kuvaUrl: string): Promise<string | null> {
  try {
    return await kotiutaKuvaTaiHeita(avain, kuvaUrl)
  } catch {
    return null
  }
}
