// Post Bar (postbar.fi) etusivun ohjelmalistan parseri — PUHDAS,
// fixture-testattava (scripts/test-categories.ts).
//
// Sivun rakenne 8/2026 (uusi saitti): tapahtumat ovat <article class="event …">
// -lohkoina etusivulla (EItään erillistä ohjelmasivua eikä <li>-listaa, johon
// vanha parseri nojasi → palautti 0). Jokaisessa artikkelissa:
//   <time datetime="2026-08-20" class="event-date">Thursday • August 20th</time>
//   <h3 class="event-title …"><span class="event-title_act">TRANCE BAR:</span>
//     <span class="event-title_act" data-schedule-…>CEB & UNA</span>…</h3>
//   <div class="admission-info">Doors: 22-05<br>Free before 23 / 14€ after.</div>
//   <a class="event-link" href="https://postbar.fi/program/2026-08-22-…">
// HUOM: palvelin koodaa osan merkeistä HTML-entiteeteiksi (&#x20; &#x3A; &#x2F;
// jopa class- ja href-attribuuteissa) — siksi koko HTML dekoodataan ensin.
// Päivämäärä luetaan <time datetime>-attribuutista (täysi ISO, ei
// vuodenpäättelyä). Otsikko koostetaan kaikista event-title_act-spaneista.

export interface PostbarItem {
  date: string  // YYYY-MM-DD (<time datetime>)
  title: string
  time: string  // "HH:MM" — "Doors:"-merkinnästä, oletus 22:00
  url: string   // ohjelmasivun linkki (event-link)
}

/** HTML-entiteettien dekoodaus — myös heksamuoto &#x3A; jota postbar.fi käyttää. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// "Doors: 20-02" → 20:00, "Doors: 20:30-22:30" → 20:30, "Doors 22-05" → 22:00
function parseDoors(s: string): string | null {
  const m = s.match(/Doors:?\s*(\d{1,2})(?:[.:](\d{2}))?/i)
  if (!m) return null
  const hh = parseInt(m[1])
  if (hh < 0 || hh > 23) return null
  return `${String(hh).padStart(2, '0')}:${m[2] ?? '00'}`
}

/** Parsii postbar.fi:n etusivun <article class="event …"> -lohkot. */
export function parsePostbarEvents(html: string): PostbarItem[] {
  const doc = decodeEntities(html)
  const results: PostbarItem[] = []

  for (const m of doc.matchAll(/<article[^>]*class="event[\s\S]*?<\/article>/g)) {
    const block = m[0]

    const dateM = block.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/)
    if (!dateM) continue
    const date = dateM[1]

    // Otsikko: kaikki event-title_act -spanit välilyönnillä yhdistettynä
    // (esim. "TRANCE BAR:" + "CEB & UNA" + "STELLA & EEMELI ENGBERG")
    const parts = [...block.matchAll(/<span class="event-title_act"[^>]*>([\s\S]*?)<\/span>/g)]
      .map((p) => stripTags(p[1]))
      .filter((p) => p.length > 0)
    const title = parts.join(' ').replace(/\s+/g, ' ').trim()
    if (title.length < 2) continue

    const linkM = block.match(/<a class="event-link" href="([^"]+)"/)
    const url = linkM?.[1] ?? 'https://postbar.fi'

    const admM = block.match(/<div class="admission-info">([\s\S]*?)<\/div>/)
    const time = (admM && parseDoors(stripTags(admM[1]))) || '22:00'

    results.push({ date, title, time, url })
  }
  return results
}
