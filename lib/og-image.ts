// Festivaalikuvan poiminta festivaalin OMALTA sivulta — ilmainen HTTP, ei
// maksullista rajapintaa. Käytetään uusien festareiden tuonnissa
// (app/api/admin/bulk-import-festivals) ja backfillissä
// (scripts/backfill-festival-images.ts).
//
// Etusija: og:image → twitter:image → JSON-LD (Event-kuva ensin, sitten muu).
// og:image on käytännössä aina festarisivun jakokuva.

const UA = 'Mozilla/5.0 (compatible; Helsinki-Events-Bot/1.0)'

// Lipunmyyjät: EI oteta niiden sivun kuvaa festarikuvaksi (geneerinen
// vendor-banneri). ticket_url osoittaa usein näihin.
const VENDOR_DOMAINS = ['tiketti.fi', 'lippu.fi', 'livenation.fi', 'ticketmaster.fi', 'kide.app', 'eventbrite.com', 'eventbrite.fi', 'holvi.com']

function isVendorUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '')
    return VENDOR_DOMAINS.some((d) => h === d || h.endsWith('.' + d))
  } catch {
    return false
  }
}

/** Purkaa HTML-entiteetit (myös numeeriset/heksat) — muuten esim. &#38; jättäisi
 *  '#':n joka katkaisisi query-stringin URLia jäsennettäessä. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
}

/** Palauttaa ensimmäisen <meta>-tagin content-arvon jonka property/name täsmää. */
function metaContent(html: string, keys: string[]): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  const wanted = new Set(keys.map((k) => k.toLowerCase()))
  for (const tag of tags) {
    const key = (tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1] ?? '').toLowerCase()
    if (!wanted.has(key)) continue
    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1]
    if (content) return content
  }
  return null
}

function typeMatches(node: Record<string, unknown>, re: RegExp): boolean {
  const t = node['@type']
  if (typeof t === 'string') return re.test(t)
  if (Array.isArray(t)) return t.some((x) => typeof x === 'string' && re.test(x))
  return false
}

function imageOf(node: Record<string, unknown>): string | null {
  const im = node.image
  if (typeof im === 'string' && im) return im
  if (Array.isArray(im) && im.length) {
    const f = im[0]
    if (typeof f === 'string') return f
    if (f && typeof f === 'object' && typeof (f as Record<string, unknown>).url === 'string') return (f as Record<string, unknown>).url as string
  }
  if (im && typeof im === 'object' && typeof (im as Record<string, unknown>).url === 'string') return (im as Record<string, unknown>).url as string
  return null
}

/** Etsii kuvan JSON-LD:stä. eventOnly=true → vain Event-tyyppiset solmut (jotta
 *  Organization/WebSite-logo ei mene festarikuvaksi); false → mikä tahansa paitsi
 *  Organization/WebSite/WebPage. */
function walkLd(node: unknown, eventOnly: boolean, depth = 0): string | null {
  if (!node || depth > 6) return null
  if (Array.isArray(node)) {
    for (const n of node) { const i = walkLd(n, eventOnly, depth + 1); if (i) return i }
    return null
  }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (eventOnly) {
      if (typeMatches(o, /event/i)) { const i = imageOf(o); if (i) return i }
    } else if (!typeMatches(o, /organization|website|webpage/i)) {
      const i = imageOf(o); if (i) return i
    }
    for (const k of ['@graph', 'mainEntity', 'item', 'subEvent']) {
      if (o[k]) { const i = walkLd(o[k], eventOnly, depth + 1); if (i) return i }
    }
  }
  return null
}

function jsonLdImage(html: string): string | null {
  const blocks = html.match(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? []
  const parsed: unknown[] = []
  for (const b of blocks) {
    const json = b.replace(/<script\b[^>]*>/i, '').replace(/<\/script>/i, '').trim()
    try { parsed.push(JSON.parse(json)) } catch { /* rikkinäinen JSON-LD */ }
  }
  for (const d of parsed) { const i = walkLd(d, true); if (i) return i }   // Event ensin
  for (const d of parsed) { const i = walkLd(d, false); if (i) return i }  // sitten muu (ei Org)
  return null
}

/** Poimii parhaan kuvan HTML:stä ja palauttaa absoluuttisen URLin (tai null).
 *  baseUrl pitää olla LOPULLINEN (redirectin jälkeinen) URL. */
export function extractImageFromHtml(html: string, baseUrl: string): string | null {
  const raw =
    metaContent(html, ['og:image', 'og:image:url', 'og:image:secure_url']) ||
    metaContent(html, ['twitter:image', 'twitter:image:src']) ||
    jsonLdImage(html)
  if (!raw) return null
  const cleaned = decodeEntities(raw).trim()
  if (!cleaned || cleaned.startsWith('data:')) return null
  try {
    const u = new URL(cleaned, baseUrl)
    if (!/^https?:$/i.test(u.protocol)) return null
    // Laatusuoja: favicon / sivukuvake (WordPressin "cropped-…") näyttää
    // venytettynä kortissa huonolta. Testaa polku/tiedostonimi, ei koko URLia.
    const path = u.pathname.toLowerCase()
    const file = path.slice(path.lastIndexOf('/') + 1)
    // Testaa vain TIEDOSTONIMEÄ, ei koko polkua (muuten esim. CDN-polku
    // /assets/apple-touch-icon-set/hero.jpg hylkäytyisi väärin).
    if (/^(favicon|apple-touch-icon|cropped-)/.test(file)) return null
    return u.toString()
  } catch {
    return null
  }
}

/** Hakee sivun (byte-katto 512 kt riittää <head>:iin) ja palauttaa myös
 *  LOPULLISEN URLin (redirectin jälkeen) suhteellisten kuvien pohjaksi. */
async function fetchPage(url: string, timeoutMs = 6000): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' })
    if (!res.ok) return null
    if (!(res.headers.get('content-type') ?? '').includes('html')) return null
    const reader = res.body?.getReader()
    if (!reader) return { html: await res.text(), finalUrl: res.url || url }
    const MAX = 512 * 1024
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) { chunks.push(value); total += value.length }
      if (total >= MAX) { await reader.cancel(); break }
    }
    const buf = new Uint8Array(total)
    let off = 0
    for (const c of chunks) { buf.set(c, off); off += c.length }
    return { html: new TextDecoder('utf-8').decode(buf), finalUrl: res.url || url }
  } catch {
    return null
  }
}

/** Hakee festivaalikuvan sen omalta sivulta: info_url, sitten ticket_url
 *  (ohittaen lipunmyyjä-domainit). Palauttaa kuvan URLin tai null. */
export async function fetchFestivalImage(infoUrl?: string | null, ticketUrl?: string | null): Promise<string | null> {
  for (const url of [infoUrl, ticketUrl]) {
    if (!url || !/^https?:\/\//i.test(url) || isVendorUrl(url)) continue
    const page = await fetchPage(url)
    if (!page) continue
    const img = extractImageFromHtml(page.html, page.finalUrl)
    if (img) return img
  }
  return null
}
