// Ravintolan ruokalistan tiivistelmä korttiin: tyypillinen annoshinta ja kolme
// edustavaa annosta. Lähde on google_raw.services (DataForSEO), joka on tallessa
// 202 paikalle — mitattuna 5858 annosta, 5244 hinnalla.
//
// TÄMÄ TIEDOSTO ON OLEMASSA KAHDEN MITATUN ANSAN TAKIA.
//
// ANSA 1 — "ALKAEN"-HINTA ON VALHE. Halvin rivi ei ole halvin annos vaan lisuke
// tai juoma. Mitattu 55 hyvin arvioidulla paikalla: 67 %:lla halvin rivi on alle
// 40 % mediaanista.
//     Bistro Liekki   halvin "Extra Dippi" 1,70 €   mediaani 23,00 €
//     Daddy Greens    halvin "Basilika"    0,60 €   mediaani 16,90 €
//     Dilber          halvin "Limu 0.25 L" 2,00 €   mediaani 13,50 €
// "Alkaen 1,70 €" olisi väärä kahdessa kolmesta paikasta. Siksi näytetään
// MEDIAANI ja se nimetään arvioksi ("annokset n. 23 €"), ei alarajaksi.
//
// ANSA 2 — LISTAN ALKU ON USEIN JUOMIA. Bistro Liekin kolme ensimmäistä riviä
// ovat Bonaqua, Koff ja Sprite. Juomariveillä ei kuitenkaan yleensä ole kuvausta,
// annoksilla on — joten kuvauksen vaatiminen suodattaa ne pois. Mitattu tulos
// samoilta paikoilta:
//     Bistro Liekki  → CHILI SMASH 23 €, ONION LOVER SMASH 23 €, BACON SMASH 23 €
//     Café Bar No 9  → Bolognese 15,90 €, Carbonara 15,90 €, Creamy Mushroom 15,90 €
//     Daddy Greens   → Jumbo Caesar 16,90 €, The Dude 16,90 €, Bee Sting 16,90 €
// 157/202 paikalla on vähintään kolme kuvattua annosta.

/** Hinta-alaraja: päästää läpi aidot pizzatäytteet (0,60 €) mutta pudottaa
 *  "0,00 €" -rivit, jotka eivät tarkoita ilmaista. */
const PRICE_MIN_EUR = 0.5
/** Yläraja: yksi ravintola listaa nuudelikeiton hintaan 1 824 € (18 riviä
 *  5244:stä). Väärä hinta on käyttäjälle pahempi kuin puuttuva. */
const PRICE_MAX_EUR = 200
/** Kuvauksen vähimmäispituus. Juomarivi on pelkkä nimi; annoksella on selite. */
const DESC_MIN_CHARS = 10
/** Alle tämän ei muodosteta tiivistelmää — kahden annoksen lista ei kerro mitään. */
const MIN_DISHES = 3
const SAMPLE_COUNT = 3

// ── KATEGORIASUODATUS ───────────────────────────────────────────────────────
// Pelkkä kuvausvaatimus ei riitä: myös cocktaileilla on kuvaus. Mitattu:
//     Elite               → näytteinä "Negroni 13 €", "Olgan Eliksiiri 13 €"
//     Stefan's Steakhouse → näytteinä juustoa ja Creme Bruléeta, pihvit puuttuivat
// Onneksi KAIKILLA 5858 annoksella on `category`, joten se voidaan käyttää.
// Eliten kategoriat: APERITIIVEJA, TAITEILIJAMENU, KASVISMENU, ALKURUOAT,
// KLASSIKOT, PÄÄRUOAT, JÄLKIRUOAT. Stefan'sin: Starters, Main Course, Steaks,
// Sauces, Butters, Sides, Desserts.

/** Lisukkeet ja mausteet EIVÄT ole koskaan annoksia — pudotetaan aina. */
const ADDON_RE = /lisukk|sides?\b|sauce|kastikk|butter|voi\b|dippi|dip\b|extra|lisäos|topping/i

/** Juomat pudotetaan VAIN jos paikalla on ruokakategorioita. Kahvilalla kahvi ON
 *  tuote, eikä sitä saa suodattaa pois — muuten kahvila katoaa kokonaan. */
const DRINK_RE = /juoma|drink|aperitiiv|cocktail|viini|wine|olut|beer|kahvi|coffee|tee\b|teet\b|shot|spirit|samppanj|champagne/i

/** Pääruokakategoriat. Jos näitä löytyy, tiivistelmä tehdään VAIN niistä —
 *  silloin pihviravintola näyttää pihvejä eikä jälkiruokia. */
const MAIN_RE = /pääruo|main|steak|pihvi|pizza|pinza|burger|smash|klassiko|annokse|sushi|entree|lounas|lunch|donburi|nuudel|noodle|curry|wok|kanaruo|kasvisruo|salaat|salad|keitto|soup|pasta|risotto|kala|meat|liha/i

export interface MenuSample {
  title: string
  price: string
}

export interface MenuSummary {
  /** Mediaanihinta euroina. Esitetään ARVIONA, ei alarajana. */
  typicalPrice: number
  /** Montako kelvollista annosta listalla on yhteensä. */
  dishCount: number
  /** Kolme mediaanin lähintä annosta — edustavia, eivät halvimpia. */
  samples: MenuSample[]
}

interface RawService {
  title?: unknown
  snippet?: unknown
  category?: unknown
  price?: { current?: unknown; currency?: unknown; displayed_price?: unknown } | null
}

interface Dish {
  title: string
  price: number
  displayed: string
  described: boolean
  category: string
}

function median(sorted: number[]): number {
  const n = sorted.length
  if (n === 0) return 0
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
}

function formatEur(cur: number, displayed: string): string {
  // displayed_price säilyttää hintahaarukat ("12–15 €"); käytetään sitä vain kun
  // numeerinen arvo on läpäissyt tarkistuksen.
  return displayed || `${cur.toFixed(2).replace('.', ',')} €`
}

/** google_raw.services → korttitiivistelmä, tai null jos dataa ei ole riittävästi. */
export function summariseMenu(services: unknown): MenuSummary | null {
  if (!Array.isArray(services)) return null

  const dishes: Dish[] = []
  for (const raw of services as RawService[]) {
    const title = typeof raw?.title === 'string' ? raw.title.trim() : ''
    if (!title) continue
    const p = raw?.price
    const cur = typeof p?.current === 'number' && Number.isFinite(p.current) ? p.current : null
    if (cur === null) continue
    const currency = typeof p?.currency === 'string' ? p.currency : 'EUR'
    if (currency !== 'EUR') continue
    if (cur < PRICE_MIN_EUR || cur > PRICE_MAX_EUR) continue
    const snippet = typeof raw?.snippet === 'string' ? raw.snippet.trim() : ''
    const category = typeof raw?.category === 'string' ? raw.category.trim() : ''
    if (ADDON_RE.test(category)) continue      // lisukkeet ja kastikkeet aina pois
    dishes.push({
      title: title.slice(0, 60),
      price: cur,
      displayed: typeof p?.displayed_price === 'string' ? p.displayed_price.trim() : '',
      described: snippet.length >= DESC_MIN_CHARS,
      category,
    })
  }
  if (dishes.length < MIN_DISHES) return null

  // RUOALLE EI OLE HINTOJA → EI TIIVISTELMÄÄ.
  //
  // Mitattu Stefan's Steakhouse: 70 riviä, joista Steaks 16, Main Course 6 ja
  // Starters 10 — ja NIISTÄ YHDELLÄKÄÄN ei ole hintaa. Hinta on vain kastikkeilla
  // (8), voilla (7) ja jälkiruoilla (6). Ilman tätä tarkistusta kortissa lukisi
  // "annokset n. 12 €" ja näytteinä Creme Brulée ja juustokakku — pihviravintola,
  // jonka pihvit puuttuvat. Väärä hinta on pahempi kuin puuttuva.
  //
  // Sääntö: jos paikalla ON pääruokakategorioita mutta yhdelläkään niiden
  // rivillä ei ole kelvollista hintaa, hintadata koskee jotain muuta kuin ruokaa
  // → ei tiivistelmää. Leipomo tai jälkiruokabaari, jolla pääruokakategorioita
  // ei ole lainkaan, läpäisee normaalisti.
  const hasMainCategory = (services as RawService[]).some(
    (raw) => typeof raw?.category === 'string' && MAIN_RE.test(raw.category),
  )
  if (hasMainCategory && !dishes.some((d) => MAIN_RE.test(d.category))) return null

  // Valinta kolmessa portaassa, väljin viimeisenä — tavoite on että pihviravintola
  // näyttää pihvejä, kahvila kahvia, eikä kumpikaan cocktaileja.
  //   1) pääruokakategoriat, jos niitä on
  //   2) muuten kaikki paitsi juomat — mutta vain jos ruokaa jää tarpeeksi
  //   3) muuten kaikki (kahvila, jonka koko lista on juomia)
  // Kuvausvaatimus toimii näiden sisällä lisäseulana.
  const mains = dishes.filter((d) => MAIN_RE.test(d.category))
  const nonDrinks = dishes.filter((d) => !DRINK_RE.test(d.category))
  const base = mains.length >= MIN_DISHES ? mains : (nonDrinks.length >= MIN_DISHES ? nonDrinks : dishes)
  const described = base.filter((d) => d.described)
  const pool = described.length >= MIN_DISHES ? described : base

  const typical = median(pool.map((d) => d.price).sort((a, b) => a - b))

  // Mediaanin lähimmät — edustava annos, ei halvin eikä kallein. Tasatilanteessa
  // halvempi voittaa, jotta järjestys on vakaa eikä heittele ajojen välillä.
  const samples = [...pool]
    .sort((a, b) => Math.abs(a.price - typical) - Math.abs(b.price - typical) || a.price - b.price)
    .slice(0, SAMPLE_COUNT)
    .map((d) => ({ title: d.title, price: formatEur(d.price, d.displayed) }))

  return {
    typicalPrice: Math.round(typical * 100) / 100,
    dishCount: pool.length,
    samples,
  }
}
