const SCRAPE_UA = 'MitaTanaanBot/1.0 (+https://mitatanaan.fi; Helsinki guide)'

// Toimituksellisten listasivujen poiminta — jaettu ravintola- ja
// aktiviteettihakujen kesken (scripts/fetch-restaurant-reasons.ts ja
// scripts/fetch-activity-reasons.ts). Kaikki säännöt ovat mitattuja; älä
// muokkaa ilman uutta mittausta. Historia ja mittaukset: ks. skriptien
// otsikkokommentit.

// UUDELLEENYRITYS. Mitattu 23.8.2026: avoindata.suomi.fi palautti 404 lupa­
// rekisterin tiedostoon, ja minuuttia aiemmin sama osoite oli toiminut. CKAN
// vahvisti ettei osoite ollut muuttunut — palvelin vain pettää satunnaisesti.
// Koska yhdenkin lähteen kaatuminen estää KOKO tiedoston kirjoittamisen
// (tarkoituksella), hetkellinen häiriö olisi keskeyttänyt viikkopäivityksen
// aika ajoin ilman mitään syytä.
const RETRIES = 3
const RETRY_PAUSE_MS = 4000

export async function get(url: string): Promise<string>
export async function get(url: string, kind: 'json'): Promise<unknown>
export async function get(url: string, kind: 'buffer'): Promise<Buffer>
export async function get(url: string, kind: 'text' | 'json' | 'buffer' = 'text') {
  let last = ''
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': SCRAPE_UA }, redirect: 'follow' })
      if (!res.ok) throw new Error(`${res.status}`)
      if (kind === 'json') return await res.json()
      if (kind === 'buffer') return Buffer.from(await res.arrayBuffer())
      return await res.text()
    } catch (e) {
      last = (e as Error).message
      if (attempt < RETRIES) await new Promise((s) => setTimeout(s, RETRY_PAUSE_MS * attempt))
    }
  }
  throw new Error(`${last} (${RETRIES} yritystä) ${url}`)
}

export function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&#8217;|&#039;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Yleisotsikot joita listasivun <h3> voi sisältää nimien lisäksi. Nämä eivät
 *  ole paikkoja. Mitattu MyHelsingistä: "Visit", "Live & Work", "Business &
 *  CVB"; Time Outista: uutiskirje- ja suositteluosiot. */
// KAKSI ERI HYLKÄYSTAPAA, koska yksi regex teki vääryyttä:
//   1. sisältösanat — otsikko jossa lukee "newsletter" tms. ei ole paikka
//   2. TÄSMÄLLEEN yleisotsikko — "Helsinki" yksinään on navigaatiota, mutta
//      "Surf House Helsinki" on paikka. Aiempi /helsinki/-osuma pudotti sen ja
//      koko Kotimaassa.fi-listan (mitattu: 23 nimestä jäi 4).
const NOT_A_VENUE_CONTAINS =
  /newsletter|uutiskirje|lue myös|read more|recommended|discover|share|cookie|live & work|business & cvb|tickets|advertising|time\s*out/i
const NOT_A_VENUE_EXACT =
  /^(helsinki|visit|vieraile|myhelsinki|matkailijoille|ammattilaisille|some|maat|lisää|vinkkejä paikkoihin!?|muut)$/i
/**
 * Numeroimaton otsikko voi olla VINKKILAUSE eikä paikka — mitattu MyHelsingin
 * lapsijutusta: "Leiki, lue ja loikoile Oodin kirjastossa", "Koe Heureka-
 * hetkiä tiedekeskuksessa". Paikannimi on enintään neljä sanaa eikä ala
 * kehotusverbillä. "The Helsinki Distilling Company" (4 sanaa) läpäisee.
 */
const SENTENCE_VERB =
  /^(koe|leiki|lue|tutustu|nauti|uppoudu|tervehdi|vieraile|katso|kokeile|loyda|löydä|opi|hyppaa|hyppää|sukella|discover|explore|enjoy|visit|meet|try)\b/i
export function looksLikeSentence(t: string): boolean {
  return t.split(/\s+/).length > 4 || SENTENCE_VERB.test(t)
}

export const NOT_A_VENUE = {
  test: (t: string) => NOT_A_VENUE_CONTAINS.test(t) || NOT_A_VENUE_EXACT.test(t.trim()),
}

/**
 * Listan otsikko kortin LISTARIVILLE (📋 …). Sivun <h1> on kokonainen lause —
 * "Helsingin parhaat pizzat – tästä eivät lätyt lopu" — joten se katkaistaan
 * ensimmäisestä pilkusta tai ajatusviivasta. Sivustotason otsake ("Time Out
 * Worldwide") hylätään: silloin riviä ei näytetä lainkaan.
 *
 * AIEMPI VIRHE JOKA TEHTIIN TÄSSÄ: otsikko meni pilleriin ja 38 merkin katkaisu
 * pudotti esim. "Helsingin parhaat aamiaiset ja brunssit" (39) kokonaan, jolloin
 * merkiksi jäi tyhjänpäiväinen "Time Out Helsinki". Omistaja huomasi: merkki ei
 * kertonut MIKSI paikka on nostettu. Nyt pilleri on lyhyt ("Time Out · sija 1")
 * ja listan koko nimi elää tällä rivillä, jossa tila riittää.
 */
export const LIST_NOTE_MAX = 60
export function listTitleNote(h1: string): string | undefined {
  const head = h1.split(/[,–—:|]/)[0].trim()
  if (!head || head.length < 3 || /time\s*out|myhelsinki/i.test(head)) return undefined
  if (head.length <= LIST_NOTE_MAX) return head
  return head.slice(0, LIST_NOTE_MAX).replace(/\s+\S*$/, '') + '…'
}

/** Pilleri: lähde ja sijoitus, ei muuta. Listan nimi on listarivillä. */
export function listPill(prefix: string, rank?: number): string {
  return typeof rank === 'number' ? `${prefix} · sija ${rank}` : prefix
}

/** Poimii listasivun <h3>-nimet. Numeroidut aina; numeroimattomat vain jos ne
 *  läpäisevät järkevyysseulan (pituus, ei yleisotsikko). Sijaintiselite
 *  pilkun/ajatusviivan perässä siivotaan: "Superterassi, Kasarmitori" ja
 *  "Cafe Regatta – charming cottage by the sea" ovat paikkoja, eivät nimiä. */
export function extractListEntries(html: string): { name: string; rank?: number }[] {
  const out: { name: string; rank?: number }[] = []
  for (const m of html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)) {
    let t = stripTags(m[1])
    let rank: number | undefined
    const numbered = /^(\d+)\.\s*(.+)$/.exec(t)
    if (numbered) {
      rank = Number(numbered[1])
      t = numbered[2].trim()
    } else if (t.length < 3 || t.length > 42 || NOT_A_VENUE.test(t) || looksLikeSentence(t)) continue
    t = t.split(/\s+[–—]\s+/)[0].trim()
    if (t.length >= 3) out.push({ name: t, rank })
  }
  return out
}

