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
  | 'huippuarvio'      // kaupungin arvostetuimpia — todisteena arvostelut itse
  | 'uutinen'          // tuore lehtijuttu paikasta: tarjous, tapahtuma, avaus
  | 'nayttely'         // museon tai gallerian ajankohtainen näyttely (museot.fi)

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
   * haetaan kortti (scripts/fetch-new-openings.ts) ja näyttönimenä
   * Uutta Helsingissä -aikajanalla (lib/new-in-helsinki.ts).
   */
  venue?: string
  /** Koordinaatit lähteestä (OSM). Uutta Helsingissä -sivun kartta- ja
   *  kaupunginosatietoa varten. */
  lat?: number
  lon?: number
  /** OSM:n päätagin arvo (cafe, sauna, museum, bakery…). Uutta Helsingissä
   *  -sivu luokittelee rivit tällä. */
  venueType?: string
}

/** Tiedostoon `data/restaurant-reasons.json` tallennettu muoto. */
export interface ReasonFile {
  /** Milloin haettu — näytetään ylläpidolle, ei käyttäjälle. */
  fetchedAt: string
  /** Avain = normalisoitu nimi (`reasonKey`). */
  byName: Record<string, RestaurantReason[]>
  /** Lähdekohtaiset lukumäärät, jotta romahdus näkyy diffissä. */
  counts: Record<string, number>
  /**
   * KAIKKI OSM:n uudet paikat (myös kahvilat, leipomot ja putiikit, jotka
   * eivät kuulu tekemistä-sivulle) Uutta Helsingissä -aikajanaa varten.
   * Erillään byName-osiosta tarkoituksella: byName syöttää nimiosumia
   * tekemistä-korteille, ja uusi kahvila samalla nimellä kuin vanha
   * aktiviteetti antaisi väärän "Uusi paikka" -merkin.
   */
  newPlaces?: RestaurantReason[]
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
    // NFKD hajottaa ääkköset perusmerkiksi + tarkkeeksi (ä → a + U+0308).
    // Tarke on poistettava TYHJÄNÄ ennen merkkiluokkasuodatusta — muuten se
    // muuttuu välilyönniksi ja "Linnanmäki" → "linnanma ki". Mitattu:
    // isTouristBasic('Linnanmäki') palautti false juuri tämän takia, ja
    // kaikki ääkkösnimet osuivat vain välilyönnittömän varianttinsa kautta.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]+/g, ' ')
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
  // Pilkun etuosa: listat kirjoittavat sijainnin nimen perään — mitattu
  // Time Outin terassilistalta "Superterassi, Kasarmitori". Etuosa on
  // johdettu variantti (5 merkin alaraja pätee), joten "Olo, Helsinki" ei
  // tuota vaarallisen lyhyttä avainta.
  const comma = name.split(',')
  if (comma.length > 1) add(comma[0], true)
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
    .replace(/[\u0300-\u036f]/g, '')   // sama tarkekorjaus kuin reasonKeyssä
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const m = /^([a-z][a-z ]*?)\s+(\d+)/.exec(s)
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
  huippuarvio: 70,
  // Näyttely on aikasidonnainen laatusyy: museo jossa alkoi juuri uusi
  // näyttely on helsinkiläiselle syy lähteä — sama museo ilman sitä on
  // turistikohde. Paino huippuarvion ja top50:n välissä.
  nayttely: 75,
  uusi: 60,
  // Uutisen paino on matala TARKOITUKSELLA: nosto kärkeen tapahtuu
  // rakenteellisesti (ks. interleaveReasoned — uutiselliset menevät sekoituksen
  // ETEEN), ei painolla. Matala paino pitää huolen siitä, ettei "Uutisissa"
  // syrjäytä Michelin-merkkiä kortin ensisijaisena syynä — otsikko näytetään
  // kortissa joka tapauksessa omana rivinään.
  uutinen: 55,
  timeout: 50,
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
  if (r.kind === 'nayttely' && r.date) {
    const t = Date.parse(r.date)
    if (Number.isNaN(t)) return base
    const days = Math.abs((today.getTime() - t) / 86_400_000)
    // Juuri alkanut tai kohta alkava näyttely on uutinen; puolen vuoden
    // ikäinen on pysyväisluonteinen. Lineaarinen hiipuma 90 päivässä.
    return base + Math.max(0, 15 * (1 - days / 90))
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

/**
 * Paikan kokonaispaino = vahvin syy + pieni lisä muista. Ei summa: kolme
 * heikkoa syytä ei saa ohittaa yhtä Michelin-tähteä.
 *
 * LISÄ ON KATOLLA. Ilman kattoa neljä sivusyytä tuottaa 0,08 × (100 + 95 + 87
 * + 50) = 26,3 pistettä, mikä on YLI KAHDEN Michelin-tason (12/taso). Silloin
 * yhden tähden paikka, joka on myös 50 parasta -listan ykkönen ja Vuoden
 * ravintola, nousisi kahden tähden paikan ohi — juuri se ohitus jonka
 * `MICHELIN_TIER_BONUS` lisättiin estämään. Yhdelläkään todellisella
 * ravintolalla ei tänään ole niin monta syytä, joten vika oli piilevä, mutta
 * katto maksaa yhden rivin.
 */
const MAX_SIDE_BONUS = MICHELIN_TIER_BONUS - 1

export function reasonsWeight(reasons: RestaurantReason[], today: Date): number {
  if (!reasons.length) return 0
  const ws = reasons.map((r) => reasonWeight(r, today)).sort((a, b) => b - a)
  const side = ws.slice(1).reduce((s, w) => s + w * 0.08, 0)
  return ws[0] + Math.min(side, MAX_SIDE_BONUS)
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

// ── SEKOITUS ────────────────────────────────────────────────────────────────
// Pelkkä painojärjestys tuottaa lohkoja: ensin kaikki Michelin-tähdet, sitten
// kaikki Bibit, sitten koko Suomen 50 parasta, sitten kaikki uudet avaukset.
// Selatessa se tuntuu vuorottelevalta luettelolta, ei valikoimalta.
//
// Siksi neljä vahvaa perhettä LOMITETAAN suhteessa kokoonsa. Menetelmä on
// d'Hondt: joka paikalle valitaan perhe, jolla on suurin `koko / (otetut + 1)`.
// Perheen sisällä järjestys säilyy vahvimmasta heikoimpaan, joten Grön tulee
// yhä ennen muita Michelin-paikkoja ja sija 4 ennen sijaa 40 — mutta niiden
// välissä on uusi avaus ja 50 parasta.
//
// Perusteettomat paikat tulevat kaikkien perheiden jälkeen, ks.
// `restaurantQualityScore` komponentissa.

/** Perheet jotka lomitetaan kärkeen. Järjestys on vain tasapelin ratkaisija.
 *
 *  'timeout' (toimitukselliset listat: Time Out, MyHelsinki) oli aluksi
 *  sekoituksen TAKANA — ja omistaja huomasi heti, ettei uusia löytöjä näy
 *  sivulla lainkaan: kärkeen mahtuu 60 korttia ja pelkkiä vahvempia syitä on
 *  enemmän, joten koko perhe jäi taitteen alle. Lähteet haettiin nimenomaan
 *  asiakkaan valinnan tueksi, joten ne kuuluvat kiertoon. */
const MIXED_KINDS: ReasonKind[] = ['michelin', 'top50', 'uusi', 'vuoden-ravintola', 'huippuarvio', 'timeout', 'nayttely']

// ── UUTUUS EI OLE SUOSITUS ──────────────────────────────────────────────────
// Michelin, Suomen 50 parasta ja Vuoden ravintola ovat kaikki LAATUVÄITTEITÄ:
// joku alan ihminen on arvioinut paikan hyväksi. "Avattu heinäkuussa" ei ole —
// se kertoo vain että paikka on uusi. Siksi uutuus yksin ei riitä kuratoituun
// kärkeen, jos paikasta jo tiedetään ettei se ole hyvä.
//
// Mitattu 2492 helsinkiläisestä paikasta joilla on vähintään 15 arvostelua:
// mediaaniarvosana on 4,2 ja 60. persentiili 4,3. Raja on siis "vähintään
// kaupungin mediaanin yläpuolella". Se pudottaa 45 avauksesta neljä:
//     Roberts Coffee        3,6 (113)   ketjukahvila
//     Bistro Pasila         4,0 ( 28)
//     1664 / Market Hall    4,1 ( 17)
//     Tian Tian Dumplings   4,1 ( 19)   ← tämä oli sivulla kolmantena
// Ne eivät katoa sivulta, vaan siirtyvät muiden joukkoon oman
// uskottavuutensa mukaiselle paikalle — merkki "Avattu heinäkuussa" säilyy.
const MIN_NEW_RATING = 4.3
/** Alle tämän arvostelumäärän arvosanaa ei pidetä todisteena kumpaankaan
 *  suuntaan: vasta avattu paikka ei ehdi kerätä arvosteluja, eikä sitä saa
 *  hylätä siksi. */
const MIN_REVIEWS_TO_JUDGE = 15

/** Kelpaako uusi avaus kuratoituun kärkeen? */
function newOpeningIsGoodEnough(rating: number | undefined, reviews: number | undefined): boolean {
  const n = reviews ?? 0
  const r = rating ?? 0
  if (n < MIN_REVIEWS_TO_JUDGE || r <= 0) return true   // ei vielä näyttöä
  return r >= MIN_NEW_RATING
}

/**
 * Lomittaa perustellut paikat niin, ettei mikään perhe kasaannu. Palauttaa
 * uuden taulukon; syötettä ei muuteta. Paikat joilla ei ole syytä palautuvat
 * lopussa siinä järjestyksessä kuin ne tulivat.
 */
export function interleaveReasoned<T>(
  items: readonly T[],
  reasonsOf: (t: T) => RestaurantReason[] | undefined,
  today: Date,
  /**
   * Uskottavuuspiste 0–1 (`lib/credibility.ts`). Ratkaisee järjestyksen
   * PERHEEN SISÄLLÄ. Rooli vaihtelee perheittäin, ks. `cmp` alempana:
   * `uusi`-perheessä tämä on PÄÄASIALLINEN järjestys, muissa vain erotin
   * silloin kun luokka, sijaluku tai vuosi menevät tasan.
   *
   * Ei koskaan siirrä paikkaa perheestä toiseen — perhe määräytyy syystä.
   */
  credibility?: (t: T) => number,
  /** Arvosana ja arvostelumäärä uutuuden laatuporttia varten. Ilman tätä
   *  porttia ei sovelleta, ja kaikki uudet avaukset pääsevät kärkeen. */
  ratingOf?: (t: T) => { rating?: number; reviews?: number },
): T[] {
  const groups = new Map<ReasonKind, { item: T; w: number; c: number; p: RestaurantReason }[]>()
  const tail: { item: T; w: number; c: number; p: RestaurantReason }[] = []   // Time Out
  const none: T[] = []                                                        // ei syytä

  // ── UUTISELLISET ENSIN ────────────────────────────────────────────────────
  // Tuore lehtijuttu on ainoa syy joka VANHENEE PÄIVISSÄ — tarjous tai
  // isänpäivälounas ei hyödytä ensi kuussa. Siksi uutista kantavat paikat
  // menevät koko sekoituksen eteen, tuorein juttu ensin. d'Hondt ei sovi
  // tähän: uutisia on kerrallaan 0–5, ja niin pieni perhe saisi ensimmäisen
  // paikkansa vasta kymmenien korttien jälkeen — uutinen olisi jo vanha kun
  // se ehtisi näkyviin.
  //
  // Katto pitää tulvan kurissa: jos sesonki tuottaa kymmenen osumaa, vain
  // tuoreimmat kuusi nousevat eteen ja loput järjestyvät normaalisti (merkki
  // ja otsikko säilyvät kortissa silti).
  const FRONT_NEWS_MAX = 6
  const newsCarriers: { item: T; ts: number; c: number }[] = []
  const normal: T[] = []
  for (const item of items) {
    const nr = reasonsOf(item)?.find((x) => x.kind === 'uutinen' && x.date)
    if (nr) {
      const ts = Date.parse(nr.date!)
      newsCarriers.push({ item, ts: Number.isNaN(ts) ? 0 : ts, c: credibility?.(item) ?? 0 })
    } else {
      normal.push(item)
    }
  }
  newsCarriers.sort((a, b) => b.ts - a.ts || b.c - a.c)
  const front = newsCarriers.slice(0, FRONT_NEWS_MAX).map((x) => x.item)
  // Ylivuoto käsitellään kuten muutkin — syy ratkaiskoon.
  const classify = [...normal, ...newsCarriers.slice(FRONT_NEWS_MAX).map((x) => x.item)]

  for (const item of classify) {
    const rs = reasonsOf(item)
    const p = primaryReason(rs, today)
    if (!p) { none.push(item); continue }
    const entry = { item, w: reasonsWeight(rs!, today), c: credibility?.(item) ?? 0, p }
    // Uutuus ei ole laatuväite: heikoksi tiedetty uusi paikka ei ansaitse
    // kuratoitua paikkaa, vaan menee muiden joukkoon uskottavuutensa mukaan.
    if (p.kind === 'uusi' && ratingOf) {
      const { rating, reviews } = ratingOf(item)
      if (!newOpeningIsGoodEnough(rating, reviews)) { none.push(item); continue }
    }
    if (MIXED_KINDS.includes(p.kind)) {
      const g = groups.get(p.kind)
      if (g) g.push(entry)
      else groups.set(p.kind, [entry])
    } else {
      tail.push(entry)
    }
  }

  // ── PERHEEN SISÄINEN JÄRJESTYS ──────────────────────────────────────────
  // Kullakin perheellä on oma luonnollinen paremmuutensa, eikä yksi yhteinen
  // luku palvele niitä kaikkia:
  //
  //   michelin          tähtiluokka on koko pointti — 2★ ennen Selectediä
  //   top50             sijaluku on koko pointti — sija 4 ennen sijaa 40
  //   vuoden-ravintola  tuorein voitto ensin
  //   uusi              USKOTTAVUUS ENSIN, tuoreus vasta tasapelin ratkaisijana
  //
  // Viimeinen on käyttäjän nimenomainen korjauspyyntö. Aiemmin uusien kesken
  // järjesti pelkkä avauspäivä, jolloin kärkeen nousi Tian Tian Dumplings
  // 4,1 (19 arvostelua) vain siksi että se oli avattu päivää myöhemmin kuin
  // Gao Kitchen & Bar 5,0 (80). Uudet paikat ovat yhä omana perheenään — se
  // että ne ovat uusia näkyy merkistä — mutta niiden keskinäinen järjestys
  // seuraa nyt sitä, mitä niistä oikeasti tiedetään.
  //
  // Kaikissa perheissä uskottavuus on viimeinen erotin, jottei järjestys jää
  // sattuman varaan tasatilanteessa.
  // USKOTTAVUUS KAISTOITTAIN. Uskottavuus on liukuluku, joten `a.c !== b.c` on
  // käytännössä AINA tosi — mitattu: 45 uudesta avauksesta 41:llä on eri arvo.
  // Suoralla vertailulla tuoreus ei siis koskaan pääsisi ratkaisemaan mitään,
  // ja koko "tasapelissä tuorein ensin" -sääntö olisi kuollutta koodia.
  // Pyöristys 0,05:n kaistoihin tekee siitä aidon: saman kaistan sisällä
  // (esim. 4,9/80 ja 5,0/60) tuorein voittaa, eri kaistojen välillä
  // uskottavuus voittaa.
  const band = (c: number) => Math.round(c * 20)

  const cmp = (kind: ReasonKind) =>
    (a: typeof tail[number], b: typeof tail[number]): number => {
      if (kind === 'uusi') {
        const ba = band(a.c), bb = band(b.c)
        if (ba !== bb) return bb - ba
        return b.w - a.w                    // saman kaistan sisällä tuorein
      }
      // Huippuarvio ON uskottavuusväite, joten se järjestyy suoraan sillä.
      if (kind === 'huippuarvio') return b.c - a.c
      // Toimituslistat: sijoitettu ennen sijoittamatonta ja sija 1 ennen
      // sijaa 20 — "kaupungin paras aamiainen" on vahvempi nosto kuin pelkkä
      // maininta artikkelissa. Sijattomien kesken uskottavuus ratkaisee.
      if (kind === 'timeout') {
        const ra = typeof a.p.rank === 'number' ? a.p.rank : 999
        const rb = typeof b.p.rank === 'number' ? b.p.rank : 999
        if (ra !== rb) return ra - rb
        return b.c - a.c
      }
      if (b.w !== a.w) return b.w - a.w     // luokka, sijaluku tai vuosi
      return b.c - a.c
    }

  for (const [kind, g] of groups) g.sort(cmp(kind))
  tail.sort(cmp('timeout'))

  // d'Hondt: suurin `jäljellä olevan perheen koko / (jo otetut + 1)` voittaa.
  // Tasapelissä ratkaisee MIXED_KINDS-järjestys, jotta tulos on aina sama.
  const sizes = new Map<ReasonKind, number>()
  const taken = new Map<ReasonKind, number>()
  for (const [k, g] of groups) { sizes.set(k, g.length); taken.set(k, 0) }

  const mixed: T[] = []
  const total = [...sizes.values()].reduce((a, b) => a + b, 0)
  for (let n = 0; n < total; n++) {
    let best: ReasonKind | null = null
    let bestScore = -1
    for (const k of MIXED_KINDS) {
      const size = sizes.get(k)
      if (size === undefined) continue
      const t = taken.get(k)!
      if (t >= size) continue
      const score = size / (t + 1)
      if (score > bestScore) { bestScore = score; best = k }
    }
    if (!best) break
    mixed.push(groups.get(best)![taken.get(best)!].item)
    taken.set(best, taken.get(best)! + 1)
  }

  return [...front, ...mixed, ...tail.map((t) => t.item), ...none]
}

// ── TURISTIPERUSKOHTEET ─────────────────────────────────────────────────────
// Omistaja tekemistä-sivusta: "siellä ei tarvita linnanmäkeä tai vastaavia" —
// helsinkiläinen tietää nämä. Peruskohde EI saa huippuarvio-, toimituslista-
// eikä uutuusnostoa (Time Outin nähtävyyslistat ovat täynnä juuri näitä).
// UUTINEN ja NÄYTTELY sen sijaan nostavat: "uutinen saa nostaa Linnanmäen"
// oli omistajan nimenomainen linjaus — uusi vuoristorata tai Suomenlinnan
// näyttely on aidosti ajankohtaista myös paikalliselle.
const TOURIST_BASICS = new Set([
  'linnanmaki', 'suomenlinna', 'korkeasaari', 'sea life helsinki', 'sea life',
  'temppeliaukion kirkko', 'helsingin tuomiokirkko', 'tuomiokirkko',
  'uspenskin katedraali', 'kauppatori', 'senaatintori', 'sibelius monumentti',
  'sibeliuksen puisto', 'esplanadin puisto', 'allas sea pool',
])

/** Onko paikka turistiperuskohde? Vertailu normalisoidulla nimellä. */
export function isTouristBasic(name: string): boolean {
  return TOURIST_BASICS.has(reasonKey(name))
}

/** Syyt jotka nostavat peruskohteenkin — ajankohtainen sisältö. */
const BASIC_ALLOWED: ReasonKind[] = ['uutinen', 'nayttely']

/** Suodattaa peruskohteelta pois ne syyt jotka eivät sitä koske. */
export function filterReasonsForBasics(name: string, reasons: RestaurantReason[]): RestaurantReason[] {
  if (!isTouristBasic(name)) return reasons
  return reasons.filter((r) => BASIC_ALLOWED.includes(r.kind))
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
