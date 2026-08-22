// Syy miksi ravintola on sivun kärjessä.
//
// MIKSI TÄMÄ TIEDOSTO ON OLEMASSA. Ravintolasivu oli tietokanta: 3583 paikkaa
// järjestettynä Google-arvosanan mukaan. Mitattu 22.8.2026, miten se järjestys
// kohtelee juuri niitä paikkoja joita helsinkiläinen arvostaa:
//     sija  269   Grön                2★           4,7 (561)
//     sija  416   Nolla               Bib + Green  4,6 (900)
//     sija  623   Finnjävel Salonki   1★           4,5 (876)
//     sija 1323   Gaijin              Michelin     4,2 (1179)
// ja kärki-40 oli Fulbari, Sushi Wagocoro, Pizza Prego, Alby's Pizzeria.
// Hyvä ruoka halvalla saa 4,9; fine dining saa 4,5, koska hinta nostaa
// odotukset. ARVOSANAJÄRJESTYS NOSTAA SIIS TÄSMÄLLEEN VÄÄRÄT PAIKAT.
//
// Ratkaisu ei ole parempi kaava vaan ULKOPUOLINEN SYY: joku ihminen, joka
// tuntee ruoan, on päättänyt että tämä paikka on kiinnostava — tai paikka on
// juuri avannut. Syy on aina peräisin nimetystä lähteestä ja siihen liittyy
// linkki. Tässä tiedostossa ei keksitä yhtään syytä eikä yhtään kategoriaa.

/** Syyn laji. Järjestys tässä ei ratkaise mitään — paino on `REASON_WEIGHT`. */
export type ReasonKind =
  | 'michelin'         // Michelin-opas: tähti, Bib Gourmand tai Selected
  | 'top50'            // Suomen 50 parasta ravintolaa (Viisi Tähteä)
  | 'vuoden-ravintola' // Vuoden ravintola (Suomen Gastronomien Seura)
  | 'timeout'          // Time Out Helsinki -listanosto
  | 'uusi'             // juuri avattu tai avaamassa (anniskelulupa)

export interface RestaurantReason {
  kind: ReasonKind
  /** Käyttäjälle näytettävä teksti, esim. "Michelin 2★" tai "Avattu heinäkuussa". */
  label: string
  /** Lähteen nimi sellaisena kuin se kortissa mainitaan. */
  source: string
  /** Linkki lähteeseen. Aina läsnä paitsi jos lähteellä ei ole kohdesivua. */
  url?: string
  /** ISO-päivä. `uusi`: luvan alkupäivä. `vuoden-ravintola`: voittovuosi. */
  date?: string
  /** Sijoitus listalla, 1 = paras. Vain `top50`. */
  rank?: number
  /** Lähteen oma lyhyt kuvaus. Ei koskaan generoitua tekstiä. */
  note?: string
  /** Michelin-luokan paremmuus: 5 = 3★ … 1 = Selected. Vain `michelin`. */
  tier?: number
  /**
   * Katuosoite lähteen mukaan. Vain `uusi`. PAKOLLINEN TARKISTUS: ilman sitä
   * ketjun toinen toimipiste saisi "Avattu elokuussa" -merkin, vaikka avautunut
   * on vain toinen. Mitattu: Kummisetä on kahdessa osoitteessa (Kastelholmantie
   * 2 ja Kirstinkatu 13), ja lupa koski vain ensimmäistä.
   */
  street?: string
  /**
   * Paikan nimi sellaisena kuin lähde sen kirjoittaa. `byName`-avain on
   * normalisoitu ("bar om´pu" → "om pu"), joten alkuperäinen nimi katoaisi
   * ilman tätä — ja juuri sitä tarvitaan hakusanana kun uudelle avaukselle
   * haetaan kortti (scripts/fetch-new-openings.ts).
   */
  venue?: string
}

/** Tiedostoon `data/restaurant-reasons.json` tallennettu muoto. */
export interface ReasonFile {
  /** Milloin haettu — näytetään ylläpidolle, ei käyttäjälle. */
  fetchedAt: string
  /** Avain = normalisoitu nimi (`reasonKey`). */
  byName: Record<string, RestaurantReason[]>
  /** Lähdekohtaiset lukumäärät, jotta romahdus näkyy diffissä. */
  counts: Record<string, number>
}

// ── NIMIEN YHDISTÄMINEN ─────────────────────────────────────────────────────
// Lähteet kirjoittavat nimet eri tavoin kuin OSM. Mitattu osumatarkkuus
// 3583 ravintolaa vastaan alla olevalla normalisoinnilla:
//     Michelin        29/30  (96 %)
//     Viisi Tähteä    32/36  (88 %)
//     Time Out        21/30  (70 %)
// Loput jäävät kiinni aidoista eroista ("Baskeri & Basso (BasBas)" vs "BasBas",
// "18 grams" vs "18grams"), ei normalisoinnin puutteesta. SUMEAA HAKUA EI
// KÄYTETÄ: väärä osuma laittaisi Michelin-merkin väärään ravintolaan, ja se on
// pahempi kuin puuttuva merkki.

/** Etuliitteet ja jälkiliitteet jotka eivät erottele paikkoja toisistaan. */
const AFFIX =
  /^(ravintola|restaurant|bar|baari|cafe|café|kahvila|pub|the)\s+|\s+(oy|ab|ky|helsinki)$/

/**
 * Nimi → yhdistämisavain. Poistaa diakriitit, välimerkit ja merkityksettömät
 * liitteet. Palauttaa tyhjän merkkijonon jos nimestä ei jää mitään.
 */
export function reasonKey(name: string): string {
  let k = String(name ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9åäöéèü ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Toistetaan kunnes ei muutu: "Ravintola Bar Om'pu" → "om pu".
  let prev = ''
  while (prev !== k) {
    prev = k
    k = k.replace(AFFIX, '').trim()
  }
  return k
}

/**
 * JOHDETTUJEN varianttien vähimmäispituus. Perusavaimella ei ole alarajaa,
 * mutta sulkeista tai kauttaviivasta poimittu pala on ARVAUS siitä miten nimi
 * voisi lyhentyä, ja lyhyt arvaus osuu väärään paikkaan.
 *
 * MITATTU VÄÄRÄ OSUMA: "Arcada studerandekår (ASK)" tuotti avaimen "ask", joka
 * osui Vuoden ravintola 2014 -voittajaan ("Ask, Helsinki"). Opiskelijakunnan
 * ruokala olisi saanut Suomen arvostetuimman ravintolapalkinnon merkin. Viiden
 * merkin raja pudottaa "ask" (3) mutta säilyttää "basbas" (6) ja "18grams" (7).
 */
const MIN_DERIVED_CHARS = 5

/**
 * Saman nimen deterministiset kirjoitusasut. EI sumeaa hakua — jokainen
 * variantti on täsmällinen vaihtoehtoinen kirjoitusasu samasta merkkijonosta:
 *     "Baskeri & Basso (BasBas)"  → myös "baskeri and basso" ja "basbas"
 *     "Helsinki Coffee Roastery / Helsingin kahvipaahtimo" → molemmat puolet
 *     "18 grams"                  → myös "18grams"
 * Mitattu hyöty Time Outin listoilla: 37/55 → 40/55. Michelin ja Viisi Tähteä
 * eivät parane, mutta eivät myöskään huonone.
 */
export function reasonKeyVariants(name: string): string[] {
  const out: string[] = []
  const push = (k: string, derived: boolean) => {
    if (!k || out.includes(k) || !isUsableKey(k)) return
    if (derived && k.replace(/\s/g, '').length < MIN_DERIVED_CHARS) return
    out.push(k)
  }
  const add = (s: string, derived: boolean) => {
    const k = reasonKey(s)
    push(k, derived)
    push(k.replace(/\s/g, ''), true)   // välilyönnitön muoto on aina johdettu
  }
  add(name, false)
  const paren = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(name)
  if (paren) {
    add(paren[1], true)
    add(paren[2], true)
  }
  const slashed = name.split(/\s*\/\s*/)
  if (slashed.length > 1) for (const part of slashed) add(part, true)
  return out
}

// ── OSOITTEEN TARKISTUS ─────────────────────────────────────────────────────

/**
 * Katuosoite → "katu|numero". Kestää rekisterin sotkuisuuden, mitattu:
 *     "Eerikinkatu  20  "                  → "eerikinkatu|20"
 *     "Aleksis kiven katu 17,00510 Helsinki" → "aleksis kiven katu|17"
 *     "Firdonkatu 2 Lt A-4064 4.A krs"     → "firdonkatu|2"
 *     "Mannerheimintie 14, 2. krs"         → "mannerheimintie|14"
 * Palauttaa null jos numeroa ei löydy — silloin vertailua ei tehdä lainkaan.
 */
export function streetKey(address: string): string | null {
  const s = String(address ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9åäöéèü ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const m = /^([a-zåäöéèü][a-zåäöéèü ]*?)\s+(\d+)/.exec(s)
  if (!m) return null
  return `${m[1].trim()}|${m[2]}`
}

/**
 * Tasan yhden merkin ero kadun nimessä. Rekisterissä on lyöntivirheitä:
 * "Kolman Linja 6" kun katu on "Kolmas linja 6" — tarkka vertailu hylkäsi
 * oikean osuman. TALONUMERON on silti täsmättävä tarkalleen, joten väärän
 * kadun riski on olematon: yhden merkin päässä olevalla kadulla pitäisi vielä
 * olla sama talonumero.
 *
 * Raja on tarkoituksella tiukka eikä se korjaa kaikkea. Mitattu vastaesimerkki:
 * OSM:ssä lukee "Häeemtie 10" kun katu on "Hämeentie 10" — kahden merkin ero,
 * joten Kallio Bar jää ilman uutuusmerkkiä. Se on oikea kompromissi, sillä
 * väljempi raja alkaisi yhdistää eri katuja.
 */
function within1Edit(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let diff = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++diff > 1) return false
    if (a.length > b.length) i++
    else if (a.length < b.length) j++
    else { i++; j++ }
  }
  return diff + (a.length - i) + (b.length - j) <= 1
}

/**
 * Osuuko lähteen osoite ravintolan osoitteeseen? Tuntematon osoite EI kelpaa
 * osumaksi — uutuusmerkki annetaan vain kun molemmat päät tiedetään ja täsmäävät.
 *
 * Osoite voi olla monipalainen, eikä katu ole aina ensimmäisenä. Mitattu:
 *     "K-Marketin yläpuolella, Asemapäällikönkatu 3A, 00520 Helsinki"
 *     "Redi 1.krs Food Port, Hermannin rantatie 5, 00580 Helsinki"
 *     "Entrance at, Örskinkuja 2 LT2, Kirkonkyläntie 6"
 * Pelkkä ensimmäinen pala antaisi avaimeksi "k marketin yläpuolella". Siksi
 * jokainen pilkulla erotettu pala kokeillaan, ja riittää että yksi täsmää.
 */
export function sameStreet(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  const keys = (s: string) =>
    s.split(',').map((p) => streetKey(p.trim())).filter((k): k is string => k !== null)
  const ka = keys(a)
  const kb = keys(b)
  if (!ka.length || !kb.length) return false
  for (const x of ka) {
    const [xs, xn] = x.split('|')
    for (const y of kb) {
      if (x === y) return true
      const [ys, yn] = y.split('|')
      if (xn === yn && within1Edit(xs, ys)) return true
    }
  }
  return false
}

// EI PITUUSRAJAA. Aiemmassa uutisyhdistäjässä lyhyet nimet piti hylätä, koska
// siinä etsittiin nimeä VAPAASTA TEKSTISTÄ ja "Olo" osuisi mihin tahansa.
// Tässä verrataan avainta avaimeen täsmällisesti, joten lyhyys ei ole riski —
// ja nelimerkkinen alaraja pudottaisi juuri Olon (1★) Michelin-merkin.

/** Yleissanat jätetään pois: jos lähde listaa paikan nimellä "Pizzeria", se
 *  osuisi mihin tahansa samannimiseen. Nämä eivät erottele paikkoja. */
const GENERIC = new Set([
  'ravintola', 'kahvila', 'baari', 'pizzeria', 'bistro', 'lounas', 'terassi',
  'sushi', 'buffet', 'grilli', 'kioski', 'ruokala', 'keittio', 'olohuone',
])

export function isUsableKey(key: string): boolean {
  return key.length > 0 && !GENERIC.has(key)
}

// ── JÄRJESTYS ───────────────────────────────────────────────────────────────
// Syyllinen paikka menee aina syyttömän edelle. Syiden keskinäinen järjestys
// noudattaa sitä, kuinka vahva väite syy on:
//   – Michelin-tähti on alan tiukin arvio ja harvinaisin (6 paikkaa Helsingissä)
//   – Vuoden ravintola on Suomen vanhin ravintolapalkinto (yksi vuodessa)
//   – Suomen 50 parasta on alan ammattilaisten äänestys, ja siinä on SIJALUKU
//   – Time Out on toimituksen nosto: laajin, mutta löyhin kriteeri
//   – uusi avaus ei ole laatuväite lainkaan, mutta se on ainoa syy joka on TUORE
// Uutuus saa siksi oman tuoreusbonuksensa alla eikä kilpaile palkintojen kanssa
// pelkällä peruspainolla.
const REASON_WEIGHT: Record<ReasonKind, number> = {
  michelin: 100,
  'vuoden-ravintola': 95,
  top50: 80,
  timeout: 50,
  uusi: 60,
}

/**
 * Michelin-luokat eivät saa painaa saman verran. ILMAN TÄTÄ mitattiin, että
 * Bona Fide (Bib Gourmand) nousi sijalle 1 ja ohitti Grönin (2★) ja Palacen
 * (2★), koska sillä sattui olemaan enemmän sivusyitä. Tähti on tiukin arvio
 * mitä alalla annetaan, eikä sitä saa ohittaa listanostojen määrällä.
 * `tier` tulee hakuskriptistä: 5 = 3★, 4 = 2★, 3 = 1★, 2 = Bib, 1 = Selected.
 */
const MICHELIN_TIER_BONUS = 12

/** Kuinka monta päivää avaus pysyy "tuoreena". Sen jälkeen paino hiipuu. */
const NEW_FRESH_DAYS = 120

/** Vuoden ravintola vanhenee: 2026:n voitto on syy mennä, 2014:n ei enää. */
const AWARD_HALF_LIFE_YEARS = 6

/**
 * Yhden syyn painoarvo. `today` annetaan aina eksplisiittisesti, jotta
 * järjestys on testattava eikä riipu kellonajasta.
 */
export function reasonWeight(r: RestaurantReason, today: Date): number {
  const base = REASON_WEIGHT[r.kind] ?? 0
  if (r.kind === 'michelin') {
    return base + (typeof r.tier === 'number' ? r.tier : 1) * MICHELIN_TIER_BONUS
  }
  if (r.kind === 'vuoden-ravintola' && r.date) {
    const year = Number(r.date.slice(0, 4))
    if (!Number.isFinite(year)) return base
    const age = today.getUTCFullYear() - year
    // Puoliintuminen: tuore voitto lähes täysi paino, 12 vuoden takainen neljäsosa.
    return base * Math.pow(0.5, Math.max(0, age) / AWARD_HALF_LIFE_YEARS)
  }
  if (r.kind === 'top50' && typeof r.rank === 'number') {
    // Sija 1 on selvästi vahvempi kuin sija 50 — 20 pisteen liukuma.
    return base + Math.max(0, 20 - (r.rank - 1) * (20 / 49))
  }
  if (r.kind === 'uusi' && r.date) {
    const t = Date.parse(r.date)
    if (Number.isNaN(t)) return base
    const days = (today.getTime() - t) / 86_400_000
    // Tulevat avaukset ("avaa lokakuussa") ovat kiinnostavin uutinen: days < 0.
    if (days < 0) return base + 30
    return base + Math.max(0, 25 * (1 - days / NEW_FRESH_DAYS))
  }
  return base
}

/** Paikan kokonaispaino = vahvin syy + pieni lisä muista. Ei summa: kolme
 *  heikkoa syytä ei saa ohittaa yhtä Michelin-tähteä. */
export function reasonsWeight(reasons: RestaurantReason[], today: Date): number {
  if (!reasons.length) return 0
  const ws = reasons.map((r) => reasonWeight(r, today)).sort((a, b) => b - a)
  return ws[0] + ws.slice(1).reduce((s, w) => s + w * 0.08, 0)
}

/**
 * Ravintola + syytiedosto → sen paikan syyt. YKSI PAIKKA jossa yhdistäminen
 * tehdään, jotta API, testit ja esikatselu eivät voi ajautua erilleen.
 *
 * Kaksi vartijaa:
 *
 * 1. Sama laji vain kerran — Time Outilla sama ravintola voi olla kahdella
 *    listalla, eikä kortissa lue kahta Time Out -riviä.
 *
 * 2. `uusi` vaatii OSOITEOSUMAN. Lupa koskee yhtä toimipistettä, nimi ei.
 *    Mitattu ilman tätä: Robert's Coffee sai avausmerkin YHDENTOISTA
 *    toimipisteeseen, vaikka lupa oli vain Kaivokatu 1:lle. Samoin Kummisetä
 *    (Kirstinkatu 13, lupa Kastelholmantie 2:lle), Mr. Pastrami (Westendintie
 *    99 Espoossa) ja Döner Harju.
 *
 *    POIKKEUS: jos meillä ei ole osoitetta lainkaan mutta nimi on koko
 *    aineistossa uniikki, sekaannuksen vaaraa ei ole — ketjua ei ole. Tämä
 *    palauttaa mm. Tokyo Streetin ja Vietologien, joilta OSM-osoite puuttuu.
 *    `uniqueName` tulee kutsujalta, joka on jo laskenut nimien määrät.
 */
/**
 * Arvostelumäärä jonka yli "juuri avattu" ei ole uskottava. MITATTU: haettiin
 * kaikki paikat jotka lisättiin OpenStreetMapiin viimeisen 120 päivän aikana ja
 * katsottiin niiden Google-arvostelumäärät. Jakaumassa on puhdas aukko:
 *
 *     uskottavasti uusia          4, 7, 10, 13, 17, 23, 23, 42, 46, 52, 71, 84, 97
 *     ─────────────── aukko 97 → 240 ───────────────
 *     tunnetusti vanhoja        240 (305), 243, 250, 255, 263, 268,
 *                               358 (Palace), 406 (Kampai), 725 (Ihana Kahvila)
 *
 * Yläpuoliset ovat kaikki vakiintuneita paikkoja, jotka vain kartoitettiin tai
 * uudelleenluvitettiin. Raja 150 osuu aukon keskelle.
 */
const MAX_REVIEWS_FOR_NEW = 150

export function matchReasons(
  restaurant: { name: string; address?: string; reviewCount?: number },
  byName: Record<string, RestaurantReason[]>,
  opts?: { uniqueName?: boolean },
): RestaurantReason[] {
  const out: RestaurantReason[] = []
  const seen = new Set<ReasonKind>()
  const ourStreet = restaurant.address ? streetKey(restaurant.address) : null
  const tooEstablished = (restaurant.reviewCount ?? 0) > MAX_REVIEWS_FOR_NEW
  for (const key of reasonKeyVariants(restaurant.name)) {
    for (const reason of byName[key] ?? []) {
      if (seen.has(reason.kind)) continue
      if (reason.kind === 'uusi') {
        // Satojen arvostelujen paikka ei ole juuri avattu, sanoi rekisteri mitä
        // tahansa — ja kortti näyttäisi arvostelumäärän merkin VIERESSÄ.
        if (tooEstablished) continue
        const matches = ourStreet !== null
          ? sameStreet(reason.street, restaurant.address)
          : opts?.uniqueName === true
        if (!matches) continue
      }
      seen.add(reason.kind)
      out.push(reason)
    }
  }
  return out
}

/** Kortissa näytetään yksi syy: painavin. */
export function primaryReason(
  reasons: RestaurantReason[] | undefined,
  today: Date,
): RestaurantReason | null {
  if (!reasons?.length) return null
  return reasons.reduce((best, r) =>
    reasonWeight(r, today) > reasonWeight(best, today) ? r : best,
  )
}

// ── AVAUSPÄIVÄN SANALLISTAMINEN ─────────────────────────────────────────────
const MONTHS_INESSIVE = [
  'tammikuussa', 'helmikuussa', 'maaliskuussa', 'huhtikuussa', 'toukokuussa',
  'kesäkuussa', 'heinäkuussa', 'elokuussa', 'syyskuussa', 'lokakuussa',
  'marraskuussa', 'joulukuussa',
]

/**
 * Anniskeluluvan alkupäivä → kortin teksti. Tulevaisuus sanotaan tulevaisuutena.
 * Vuosiluku näytetään vain jos se ei ole kuluva vuosi, jottei teksti ole turhan
 * pitkä yleisimmässä tapauksessa.
 */
export function openingLabel(isoDate: string, today: Date): string | null {
  const t = Date.parse(isoDate)
  if (Number.isNaN(t)) return null
  const d = new Date(t)
  const month = MONTHS_INESSIVE[d.getUTCMonth()]
  const sameYear = d.getUTCFullYear() === today.getUTCFullYear()
  const suffix = sameYear ? '' : ` ${d.getUTCFullYear()}`
  return d.getTime() > today.getTime()
    ? `Avaa ${month}${suffix}`
    : `Avattu ${month}${suffix}`
}
