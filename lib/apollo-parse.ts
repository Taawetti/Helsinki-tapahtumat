// Apollo Live Club (apolloliveclub.fi) tapahtumaruudukon parseri — PUHDAS,
// fixture-testattava (scripts/test-categories.ts). Sivusto on WordPress +
// Elementor + The Post Grid: /tapahtumat/-sivulla jokainen keikka on
// <div class="rt-holder tpg-post-holder">, jonka <h3 class="entry-title">
// -linkistä saadaan nimi + tapahtumasivun URL ja sitä seuraavasta
// <div class="tpg-excerpt-inner">-tekstistä "5.9.2026 - 18:00 - 43,90€ - K-18".

export interface ApolloItem {
  date: string         // YYYY-MM-DD (excerptissä koko päivämäärä vuosineen — ei päättelyä)
  title: string
  time: string         // "HH:MM"
  price: string | null // "43,90€" jos excerptissä euromäärä, muuten null
  url: string          // tapahtumasivu (jonka kautta lippulinkki)
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parsii /tapahtumat/-sivun Post Grid -ruudukon. Otsikkoa seuraava ensimmäinen
 *  tpg-excerpt-inner kuuluu aina samaan ruudukkosoluun. */
export function parseApolloGrid(html: string): ApolloItem[] {
  const results: ApolloItem[] = []
  const blocks = html.matchAll(
    /<h3 class="entry-title"><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>[\s\S]*?<div class="tpg-excerpt-inner">([\s\S]*?)<\/div>/g,
  )
  for (const b of blocks) {
    const url = b[1]
    const title = decode(b[2])
    const excerpt = decode(b[3])
    if (title.length < 2) continue

    // "5.9.2026 - 18:00 - 43,90€ - K-18"
    const dt = excerpt.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s*-\s*(\d{1,2})[:.](\d{2})/)
    if (!dt) continue
    const date = `${dt[3]}-${String(parseInt(dt[2])).padStart(2, '0')}-${String(parseInt(dt[1])).padStart(2, '0')}`
    const time = `${String(parseInt(dt[4])).padStart(2, '0')}:${dt[5]}`

    // Hintasegmentti kolmantena " - "-eroteltuna; hyväksy vain jos euromerkki + numero
    const seg = excerpt.split(/\s+-\s+/)
    const price = seg[2] && /€/.test(seg[2]) && /\d/.test(seg[2]) ? seg[2] : null

    results.push({ date, title, time, price, url })
  }
  return results
}
