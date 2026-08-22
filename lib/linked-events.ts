// LinkedEvents-sivutus — estää HILJAISEN tapahtumakadon LUOKAN.
//
// Tausta (tuotantobugit 2026-08-22): api.hel.fi/linkedevents on kaksi ansaa,
// jotka yhdessä pudottivat kokonaisia lähteitä ilman yhtään virheilmoitusta.
//
// ANSA 1 — page_size on kovarajattu 100:aan ILMAN VIRHETTÄ. `page_size=500`
//   palauttaa 100 riviä, `meta.next` osoittaa loppuun ja HTTP-status on 200.
//   Mitattu: /api/museums pyysi 500 ja sai 100.
//
// ANSA 2 — `start=`-rajaus osuu myös tapahtumiin jotka ovat VAIN KÄYNNISSÄ sinä
//   päivänä: vuoden kestävät näyttelyt ja rivit joiden start_time on roskaa
//   ("0026-09-23", "2001-01-01"). Nousevalla `sort=start_time` juuri nämä
//   lajittuvat ENSIMMÄISEKSI ja täyttävät koko ensimmäisen sivun, joten
//   ikkunassa todella alkavat tapahtumat jäävät sivulle 2+ eikä niitä koskaan
//   haeta. Reitin oma päiväsuodatin heittää sitten roskarivit pois → lähde
//   palauttaa muutaman tapahtuman tai NOLLA.
//
// Mitattu ennen korjausta (ikkuna 22.8.2026 alkaen):
//   /api/helmet   0/108 (7 pv), 0/624 (30 pv)  — täysi kato, sivun 1 rivi 50
//                                                 oli 20.8. eli rajan alta
//   /api/museums  27/117 (7 pv), 27/504 (30 pv) — 95 % kato
//
// Korjaus on sivutus: haetaan sivu 1, luetaan `meta.count` ja haetaan loput
// sivut RINNAKKAIN. Sivutus yksin riittää oikeellisuuteen — laskeva
// `sort=-start_time` on lisäksi hyvä siksi, että jos maxPages katkaisee haun,
// katkaisu osuu vanhimpiin (roskaan) eikä ikkunan oikeisiin tapahtumiin.

/** LinkedEventsin todellinen sivukoon maksimi. Suurempi arvo EI ole virhe —
 *  se leikataan hiljaa tähän. Älä koskaan pyydä enempää: se antaa väärän
 *  turvallisuuden tunteen ilman että mikään kertoo katkaisusta. */
export const LE_MAX_PAGE_SIZE = 100

// Vain `id` vaaditaan — sillä dedupataan. EI indeksisignatuuria: reittien omat
// `interface LinkedEventsEvent` eivät toteuta sellaista, joten rajoite ei
// kelpuuttaisi niitä ja typecheck kaatuisi.
interface LeRow {
  id: string
}

interface LePage<T> {
  data?: T[]
  meta?: { count?: number; next?: string | null }
}

export interface LeFetchResult<T> {
  /** Kaikki rivit sivuilta 1..n, id:llä dedupattu. */
  rows: T[]
  /** false = ENSIMMÄINEN sivu petti (verkko/HTTP-virhe). Kutsuja päättää onko
   *  tämä kuolettava. Yksittäisen jatkosivun pettäminen EI laske tätä alas —
   *  se näkyy vain vajaana rivimääränä, ks. `pagesFailed`. */
  ok: boolean
  /** Montako sivua haettiin onnistuneesti. */
  pages: number
  /** Montako jatkosivua petti (rivejä puuttuu tämän verran × 100). */
  pagesFailed: number
  /** true = osumia oli enemmän kuin maxPages salli hakea. */
  truncated: boolean
  /** meta.count sivulta 1 — API:n oma osumamäärä ennen kutsujan suodatusta. */
  total: number
  /** Syy sivun 1 pettämiseen, kutsujan virheraportointia varten. Reitit jotka
   *  kertovat tilansa lähdeterveydelle (scrapeMeta) tarvitsevat eron
   *  verkkovirheen, HTTP-statuksen ja parsevirheen välillä — pelkkä
   *  "epäonnistui" hukkaisi juuri sen tiedon jolla hiljainen kuolema
   *  erotetaan hetkellisestä katkosta. */
  reason?: string
}

/**
 * Hakee LinkedEvents-kyselyn KAIKKI sivut (maxPages asti).
 *
 * @param buildUrl  sivunumero → täysi URL. Kutsuja asettaa page_size:n itse
 *                  (käytä LE_MAX_PAGE_SIZE) ja `page`-parametrin tästä luvusta.
 * @param init      TUORE fetch-optio joka kutsu. Funktio EIKÄ olio, koska
 *                  AbortSignal.timeout alkaa tikittää luontihetkellä: yhteinen
 *                  signaali antaisi toiselle sivuhaulle vähemmän aikaa kuin
 *                  ensimmäiselle ja katkaisisi sen sattumanvaraisesti.
 */
export async function fetchLinkedEventsAll<T extends LeRow>(
  buildUrl: (page: number) => string,
  init: () => RequestInit,
  opts: { maxPages?: number } = {},
): Promise<LeFetchResult<T>> {
  // 12 sivua = 1200 riviä. Mitatut todelliset osumamäärät: helmet 679 (30 pv),
  // museums 577 (30 pv) — eli reilusti alle. Katto on karkuunlähdön esto, ei
  // normaali toimintapiste; jos se osuu, `truncated` kertoo siitä.
  const maxPages = Math.max(1, opts.maxPages ?? 12)

  // RUNKO LUETAAN SAMASSA lupauksessa kuin fetch. Jos Response palautettaisiin
  // ja runko luettaisiin vasta myöhemmin, AbortSignal olisi voinut jo virheistää
  // streamin — sama bugi kaatoi 44/45 lähdettä /api/events-reitillä 8/2026.
  let firstReason: string | undefined
  const getPage = async (page: number): Promise<LePage<T> | null> => {
    const note = (r: string) => { if (page === 1) firstReason = r; return null }
    let res: Response
    try {
      res = await fetch(buildUrl(page), init())
    } catch {
      return note('fetch epäonnistui')
    }
    if (!res.ok) return note(`HTTP ${res.status}`)
    try {
      return (await res.json()) as LePage<T>
    } catch {
      return note('JSON-parsevirhe')
    }
  }

  // LUOTAIN. Sivumäärä selvitetään ENSIN yhdellä minimaalisella kyselyllä
  // (page_size=1, ei includea), jotta kaikki oikeat sivut voidaan hakea YHDESSÄ
  // rinnakkaisessa aallossa.
  //
  // Miksi tämä on välttämätön eikä optimointi: LinkedEvents vastaa hitaasti ja
  // aika seuraa rivimäärää, ei suodattimia — mitattu 100 riviä + keywords
  // = 3,5 s per pyyntö. Jos ensin haetaan sivu 1 countin takia ja loput vasta
  // sen jälkeen, tulee KAKSI aaltoa: mitattu 8,9 s. Aggregaatti (/api/events)
  // katkaisee jokaisen lähteen 8 sekuntiin, joten kaksiaaltoinen haku olisi
  // vaihtanut hiljaisen katkaisun hiljaiseen kuolemaan — reitti olisi ehtinyt
  // hakea kaiken ja silti palauttanut nollan. Luotain 0,25–0,40 s + yksi aalto
  // 4,6 s = 5,0 s, eli mahtuu budjettiin.
  const probe = async (): Promise<number | null> => {
    try {
      const u = new URL(buildUrl(1))
      u.searchParams.set('page', '1')
      u.searchParams.set('page_size', '1')
      u.searchParams.delete('include')
      const res = await fetch(u.toString(), init())
      if (!res.ok) return null
      const j = (await res.json()) as LePage<T>
      return typeof j.meta?.count === 'number' ? j.meta.count : null
    } catch {
      return null
    }
  }

  const probed = await probe()

  // Luotain epäonnistui → varapolku: sivu 1 ensin, loput sen countista. Kahden
  // aallon hidas polku on silti äärettömästi parempi kuin nolla tapahtumaa,
  // eikä luotaimen kaatuminen saa koskaan tyhjentää lähdettä.
  let pagesNeeded: number
  let firstPage: LePage<T> | null = null
  if (probed === null) {
    firstPage = await getPage(1)
    if (!firstPage) {
      return { rows: [], ok: false, pages: 0, pagesFailed: 0, truncated: false, total: 0, reason: firstReason }
    }
    const c = firstPage.meta?.count
    pagesNeeded = typeof c === 'number'
      ? Math.ceil(c / LE_MAX_PAGE_SIZE)
      : (firstPage.meta?.next ? maxPages : 1)
  } else {
    pagesNeeded = Math.ceil(probed / LE_MAX_PAGE_SIZE)
  }

  const pagesToFetch = Math.min(Math.max(pagesNeeded, 1), maxPages)

  // Sivu 1 haetaan tässä aallossa vain jos varapolku ei jo hakenut sitä.
  const wanted = Array.from({ length: pagesToFetch }, (_, i) => i + 1)
    .filter((p) => !(p === 1 && firstPage))
  const fetched = wanted.length > 0 ? await Promise.all(wanted.map((p) => getPage(p))) : []

  const pages: LePage<T>[] = firstPage ? [firstPage] : []
  let pagesFailed = 0
  for (let i = 0; i < fetched.length; i++) {
    const p = fetched[i]
    if (p) pages.push(p)
    else pagesFailed++
  }

  // Sivun 1 pettäminen EI hylkää muita sivuja. Ensimmäinen versio tästä
  // palautti tyhjän heti kun sivu 1 petti — eli jos sivu 1 katkesi hetkellisesti
  // mutta sivut 2–6 onnistuivat, 500 kelvollista tapahtumaa heitettiin pois ja
  // lähde palautti nollan. Se on täsmälleen se vika jota tämä tiedosto korjaa,
  // vain eri syystä. `ok` kertoo nyt vain onnistuiko haku ollenkaan; vajaus
  // näkyy `pagesFailed`-luvussa, jonka kutsuja lokittaa.
  if (pages.length === 0) {
    return { rows: [], ok: false, pages: 0, pagesFailed, truncated: false, total: 0, reason: firstReason }
  }

  // TURVAVERKKO kasvulle: jos syötteeseen lisättiin rivejä luotaimen jälkeen,
  // viimeinen haettu sivu ilmoittaa yhä `next`. Haetaan puuttuva häntä. Ilman
  // tätä juuri lisätty tapahtuma voisi jäädä väliin — harvinaista, mutta juuri
  // sellaista hiljaista katoa jota tämä tiedosto on olemassa estämään.
  let extraFailed = 0
  if (pages.length > 0 && pagesToFetch < maxPages) {
    const last = pages[pages.length - 1]
    if (last.meta?.next) {
      const tailCount = typeof last.meta.count === 'number' ? last.meta.count : 0
      const tailNeeded = Math.min(
        Math.max(Math.ceil(tailCount / LE_MAX_PAGE_SIZE), pagesToFetch + 1),
        maxPages,
      )
      const tail = Array.from({ length: tailNeeded - pagesToFetch }, (_, i) => pagesToFetch + 1 + i)
      if (tail.length > 0) {
        for (const p of await Promise.all(tail.map((n) => getPage(n)))) {
          if (p) pages.push(p)
          else extraFailed++
        }
      }
    }
  }

  const total = typeof pages[0]?.meta?.count === 'number' ? (pages[0].meta.count as number) : (probed ?? 0)

  // Dedup id:llä: syöte sisältää itsessään kaksoiskappaleita, ja offset-sivutus
  // voi näyttää saman rivin kahdesti jos syöte muuttuu hakujen välissä.
  const seen = new Set<string>()
  const rows: T[] = []
  for (const row of pages.flatMap((p) => p.data ?? [])) {
    if (!row?.id || seen.has(row.id)) continue
    seen.add(row.id)
    rows.push(row)
  }

  return {
    rows,
    ok: true,
    pages: pages.length,
    pagesFailed: pagesFailed + extraFailed,
    truncated: pagesNeeded > maxPages,
    total,
  }
}
