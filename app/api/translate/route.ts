// Tapahtumasisällön käännös englanniksi, pysyvällä välimuistilla.
//
// KUTSU: POST { lang: 'en', items: [{ id, title, shortDescription, description }] }
// VASTAUS: { translations: { [id]: { title, shortDescription, description } } }
//
// Vain jo käännetyt palautuvat heti; puuttuvat käännetään tässä kutsussa ja
// tallennetaan tauluun (sql/create-event-translations.sql), joten sama tapahtuma
// käännetään koko elinkaarensa aikana kerran.
//
// EPÄONNISTUMINEN EI SAA KAATAA SIVUA: jos avain puuttuu, Supabase on nurin tai
// Claude vastaa roskaa, palautetaan vain se mitä saatiin. Kutsuja näyttää
// puuttuvat suomeksi — puolivalmis englanti on parempi kuin tyhjä sivu.

import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import {
  batchItems, buildPrompt, parseResponse, sourceHash,
  type TranslatableEvent, type TranslatedFields,
} from '@/lib/translate'

/** Yhden pyynnön yläraja. Etusivu näyttää ~30 korttia kerralla; 120 kattaa
 *  myös "näytä lisää" -latauksen ilman että yksi pyyntö voi räjähtää. */
const MAX_ITEMS = 120

/** Montako erää käännetään yhdessä pyynnössä. Loput jäävät seuraavalle
 *  kutsulle välimuistin täyttyessä — näin yksittäinen pyyntö ei veny. */
const MAX_BATCHES_PER_REQUEST = 3

interface CacheRow {
  event_id: string
  source_hash: string
  title: string | null
  short_description: string | null
  description: string | null
}

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY puuttuu')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}`)
  const data = await res.json()
  const block = Array.isArray(data?.content) ? data.content[0] : null
  return typeof block?.text === 'string' ? block.text : ''
}

export async function POST(req: NextRequest) {
  let lang = 'en'
  let items: TranslatableEvent[] = []
  try {
    const body = await req.json()
    if (typeof body?.lang === 'string') lang = body.lang
    if (Array.isArray(body?.items)) items = body.items
  } catch {
    return NextResponse.json({ translations: {} })
  }

  // Suomi on lähdekieli — ei käännettävää.
  if (lang !== 'en') return NextResponse.json({ translations: {} })

  // Siivoa syöte: vain id + kolme kenttää, ei duplikaatteja, katkaistu.
  const seen = new Set<string>()
  const clean: TranslatableEvent[] = []
  for (const it of items) {
    const id = typeof it?.id === 'string' ? it.id : ''
    const title = typeof it?.title === 'string' ? it.title : ''
    if (!id || !title || seen.has(id)) continue
    seen.add(id)
    clean.push({
      id,
      title,
      shortDescription: typeof it.shortDescription === 'string' ? it.shortDescription : '',
      description: typeof it.description === 'string' ? it.description : '',
    })
    if (clean.length >= MAX_ITEMS) break
  }
  if (!clean.length) return NextResponse.json({ translations: {} })

  const wanted = new Map<string, string>()   // id → source_hash
  for (const it of clean) wanted.set(it.id, sourceHash(it))

  const out: Record<string, TranslatedFields> = {}

  // 1. Välimuisti. Hash-vertailu: jos lähde on muokannut tekstiä, rivi on
  //    vanhentunut eikä sitä käytetä.
  const stale = new Set<string>()
  if (supabase) {
    try {
      const { data } = await supabase
        .from('event_translations')
        .select('event_id, source_hash, title, short_description, description')
        .eq('lang', lang)
        .in('event_id', [...wanted.keys()])
      for (const row of (data ?? []) as CacheRow[]) {
        if (row.source_hash !== wanted.get(row.event_id)) { stale.add(row.event_id); continue }
        if (!row.title) continue
        out[row.event_id] = {
          title: row.title,
          shortDescription: row.short_description ?? '',
          description: row.description ?? '',
        }
      }
    } catch { /* välimuisti nurin → käännetään kaikki */ }
  }

  const missing = clean.filter((it) => !out[it.id])
  if (!missing.length) return NextResponse.json({ translations: out, cached: Object.keys(out).length })

  // 2. Käännä puuttuvat. Erät rinnakkain, mutta katolla — yksi pyyntö ei saa
  //    venyä loputtomiin, ja loput täydentyvät seuraavalla sivulatauksella.
  const batches = batchItems(missing).slice(0, MAX_BATCHES_PER_REQUEST)
  const fresh = new Map<string, TranslatedFields>()
  const results = await Promise.allSettled(
    batches.map(async (batch) => {
      const text = await callClaude(buildPrompt(batch))
      return parseResponse(text, batch)
    }),
  )
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const [id, t] of r.value) { fresh.set(id, t); out[id] = t }
  }

  // 3. Talleta. Kirjoitus vaatii service_role-avaimen; ilman sitä käännös
  //    palautuu käyttäjälle mutta ei jää muistiin (ja maksaa uudestaan).
  if (supabaseAdmin && fresh.size) {
    const rows = [...fresh].map(([id, t]) => ({
      event_id: id,
      lang,
      source_hash: wanted.get(id) ?? '',
      title: t.title,
      short_description: t.shortDescription,
      description: t.description,
    }))
    try {
      // Vanhentuneet rivit korvataan, uudet lisätään — sama operaatio.
      await supabaseAdmin.from('event_translations').upsert(rows, { onConflict: 'event_id,lang' })
    } catch { /* tallennus epäonnistui — käännös silti palautetaan */ }
  }

  return NextResponse.json({
    translations: out,
    translated: fresh.size,
    pending: Math.max(0, missing.length - fresh.size),
    staleRefreshed: stale.size,
  })
}
