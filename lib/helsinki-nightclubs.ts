// Curated Helsinki nightclubs, karaoke bars and rooftop venues
// Added as supplements to OSM data — only inserted if name not already in OSM results.
// Sources: MyHelsinki, Resident Advisor, Parasta Stadissa, venue websites (2025-2026)

export interface CuratedVenue {
  id: string
  name: string
  address: string
  lat: number
  lon: number
  type: 'yokerho' | 'baari'
  subCategories: string[]   // klubi | tekno | karaoke | katto
  www?: string
  /** 1–2 lauseen kuvaus oppaaseen (/yokerhot): musiikki, tunnelma, sijainti.
   *  Ei aukioloaikoja tai hintoja — ne vanhenevat (lisätty 5.11.2026). */
  kuvaus?: string
  /** Paikan ohjelmasivun slug (/ohjelma/<slug>, lib/venue-pages), jos on. */
  ohjelma?: string
}

export const HELSINKI_NIGHTCLUBS: CuratedVenue[] = [

  // Keikkapaikat (Tavastia, Semifinal, G Livelab, Bar Loose, On The Rocks,
  // Molly Malone's) ovat baareja, eivät yökerhoja (omistaja 24.9.2026) —
  // ks. lib/venue-type-overrides.

  // ── Tekno & electronic ─────────────────────────────────────────
  {
    id: 'curated-kaiku',
    name: 'Kaiku',
    address: 'Kaikukatu 4',
    lat: 60.1617, lon: 24.9727,
    type: 'yokerho',
    subCategories: ['tekno'],
    kuvaus: 'Sörnäisten teknoklubi ja Helsingin elektronisen musiikin keskus – kansainvälisiä DJ-vieraita, pitkiä settejä ja laadukas äänentoisto.',
    ohjelma: 'kaiku',
    www: 'https://kaikuhelsinki.fi',
  },
  {
    id: 'curated-aaniwalli',
    name: 'Ääniwalli',
    address: 'Pälkäneentie 13',
    lat: 60.1700, lon: 24.9367,
    type: 'yokerho',
    subCategories: ['tekno'],
    kuvaus: 'Vanhaan teollisuushalliin Vallilaan rakennettu klubi, jonka ohjelma nojaa Berliinin tyyliseen teknoon. Uudistettu 2024, tilaa noin tuhannelle.',
  },
  {
    id: 'curated-post-bar',
    name: 'Post Bar',
    address: 'Kaikukatu 2',
    lat: 60.1616, lon: 24.9725,
    type: 'yokerho',
    subCategories: ['tekno'],
    kuvaus: 'Pieni elektronisen musiikin klubi Kaikun sisäpihalla Sörnäisissä – housea, teknoa ja kokeellisempaa klubimusiikkia.',
    ohjelma: 'post-bar',
  },
  {
    id: 'curated-kult',
    name: 'KULT',
    address: 'Sturenkatu 4',
    lat: 60.1757, lon: 24.9560,
    type: 'yokerho',
    subCategories: ['tekno', 'klubi'],
    kuvaus: 'Kulttuuritalon yhteydessä Alppilassa toimiva klubi – klubi-iltoja ja elektronista musiikkia Kulttuuritalon keikkojen rinnalla.',
    ohjelma: 'kulttuuritalo',
  },
  {
    id: 'curated-pluto',
    name: 'Pluto',
    address: 'Uudenmaankatu 20',
    lat: 60.1552, lon: 24.9478,
    type: 'yokerho',
    subCategories: ['tekno', 'klubi'],
    kuvaus: 'Klubi Uudenmaankadulla keskustan tuntumassa – elektronista musiikkia ja klubi-iltoja intiimissä tilassa.',
  },

  // ── Klubit & indie / alternative ──────────────────────────────
  {
    id: 'curated-kuudes-linja',
    name: 'Kuudes Linja',
    address: 'Hämeentie 13 B',
    lat: 60.1638, lon: 24.9752,
    type: 'yokerho',
    subCategories: ['klubi'],
    kuvaus: 'Kallion keikkaklubi Hämeentiellä vuodesta 2005 – indieä, elektronista ja kokeellista musiikkia, kotimaisia ja kansainvälisiä artisteja.',
    www: 'https://kuudeslinja.com',
  },
  {
    id: 'curated-siltanen',
    name: 'Siltanen',
    address: 'Hämeentie 13 B',
    lat: 60.1640, lon: 24.9750,
    type: 'yokerho',
    subCategories: ['klubi'],
    kuvaus: 'Hämeentien kulmakivi: päivisin baari ja iso terassi, viikonloppuisin DJ-klubi – Kuudennen Linjan naapuri.',
    ohjelma: 'siltanen',
  },
  {
    id: 'curated-tavastia',
    name: 'Tavastia Klubi', // OSM:n nimi — muuten tulee tuplana (curated + osm)
    address: 'Urho Kekkosen katu 4-6',
    lat: 60.1686, lon: 24.9498,
    type: 'baari',
    subCategories: ['klubi'],
    kuvaus: 'Suomen tunnetuin rockklubi Kampissa vuodesta 1970 – keikkoja lähes joka ilta, kotimaiset ja ulkomaiset nimet.',
    ohjelma: 'tavastia',
    www: 'https://tavastiaklubi.fi',
  },
  {
    id: 'curated-semifinal',
    name: 'Semifinal',
    address: 'Urho Kekkosen katu 4-6',
    lat: 60.1686, lon: 24.9498,
    type: 'baari',
    subCategories: ['klubi'],
    kuvaus: 'Tavastian pikkuveli samassa rakennuksessa – nousevia bändejä, indieä ja klubi-iltoja.',
    ohjelma: 'semifinal',
  },
  {
    id: 'curated-on-the-rocks',
    name: 'On The Rocks',
    address: 'Mikonkatu 15',
    lat: 60.1688, lon: 24.9442,
    type: 'baari',
    subCategories: ['klubi'],
    kuvaus: 'Rockklubi Mikonkadulla keskustassa – keikkoja ja klubi-iltoja viikon ympäri, usein myöhään yöhön.',
    ohjelma: 'on-the-rocks',
    www: 'https://rocks.fi',
  },
  {
    id: 'curated-bar-loose',
    name: 'Bar Loose',
    address: 'Annankatu 21',
    lat: 60.1660, lon: 24.9433,
    type: 'baari',
    subCategories: ['klubi'],
    kuvaus: 'Rockbaari Annankadulla – pieniä keikkoja, DJ-iltoja ja rock-henkinen tunnelma keskellä kaupunkia.',
    www: 'https://barloose.com',
  },
  {
    id: 'curated-molly-malones',
    name: "Molly Malone's",
    address: 'Kaisaniemenkatu 1 C',
    lat: 60.1708, lon: 24.9442,
    type: 'baari',
    subCategories: ['klubi'],
    kuvaus: 'Irlantilaispubi Kaisaniemessä – livemusiikkia lähes joka ilta ja myöhään auki oleva tanssilattia.',
    www: 'https://mollymalones.fi',
  },
  {
    id: 'curated-kaarle-xii',
    name: 'Kaarle XII',
    address: 'Kasarmikatu 40',
    lat: 60.1644, lon: 24.9600,
    type: 'yokerho',
    subCategories: ['klubi'],
    kuvaus: 'Kasarmikadun klassikkoyökerho – tanssilattia, hittimusiikkia ja useita baareja yhdessä keskustan tunnetuimmista bilepaikoista.',
  },
  {
    id: 'curated-maxine',
    name: 'Maxine',
    address: 'Urho Kekkosen katu 1',
    lat: 60.1688, lon: 24.9483,
    type: 'yokerho',
    subCategories: ['klubi'],
    kuvaus: 'Kampin keskuksen kuudennessa kerroksessa – klubi, jossa hittimusiikkia, artistivierailuja ja näköala kaupungin ylle.',
    ohjelma: 'maxine',
  },
  {
    id: 'curated-tanner',
    name: 'Tanner',
    address: 'Hämeentie 11',
    lat: 60.1633, lon: 24.9742,
    type: 'yokerho',
    subCategories: ['klubi'],
    kuvaus: 'Kallion klubi Hämeentiellä – DJ-iltoja ja klubitapahtumia Siltasen ja Kuudennen Linjan korttelissa.',
  },
  {
    id: 'curated-g-livelab',
    name: 'G Livelab',
    address: 'Yrjönkatu 3',
    lat: 60.1667, lon: 24.9500,
    type: 'baari',
    subCategories: ['klubi'],
    kuvaus: 'Intiimi musiikkiklubi Yrjönkadulla – jazzia, maailmanmusiikkia ja indieä huippuäänentoistolla, istumapaikat ja baari.',
    ohjelma: 'g-livelab',
    www: 'https://glivelab.fi',
  },

  // ── Karaoke ────────────────────────────────────────────────────
  {
    id: 'curated-anna-k',
    name: 'Anna K',
    address: 'Annankatu 23',
    lat: 60.1665, lon: 24.9433,
    type: 'baari',
    subCategories: ['karaoke'],
    kuvaus: 'Annankadun karaokebaari keskustassa – matala kynnys, laaja biisilista ja pitkät illat.',
  },
  {
    id: 'curated-holiday-karaoke',
    name: 'Holiday Karaoke',
    address: 'Iso Roobertinkatu 2',
    lat: 60.1638, lon: 24.9417,
    type: 'baari',
    subCategories: ['karaoke'],
    kuvaus: 'Iso Roobertinkadun karaokebaari Punavuoressa – rento meininki ja karaokea myöhään.',
  },
  {
    id: 'curated-wallis-karaoke',
    name: 'Wallis Karaoke',
    address: 'Kanavaranta 7',
    lat: 60.1683, lon: 24.9600,
    type: 'baari',
    subCategories: ['karaoke'],
    kuvaus: 'Karaokebaari Kanavarannassa Kauppatorin kupeessa – pieni ja tunnelmallinen.',
  },
  {
    id: 'curated-erottaja-bar',
    name: 'Erottaja Bar',
    address: 'Erottajankatu 15-17',
    lat: 60.1638, lon: 24.9467,
    type: 'baari',
    subCategories: ['karaoke'],
    kuvaus: 'Erottajan kulmassa ydinkeskustassa – karaokea ja klubimeininkiä.',
  },
  {
    id: 'curated-karaokebar-populus',
    name: 'Karaokebar Populus',
    address: 'Aleksis Kiven katu 22',
    lat: 60.1722, lon: 24.9733,
    type: 'baari',
    subCategories: ['karaoke'],
    kuvaus: 'Vallilan karaokebaari Aleksis Kiven kadulla – paikallinen tunnelma ja karaokea.',
  },
  {
    id: 'curated-ake-karaoke',
    name: 'Åke Karaoke',
    address: 'Erottajankatu 2',
    lat: 60.1640, lon: 24.9460,
    type: 'baari',
    subCategories: ['karaoke'],
    kuvaus: 'Karaokebaari Erottajankadulla – pieni ja tunnelmallinen, keskellä iltaelämää.',
  },
  {
    id: 'curated-mascot',
    name: 'Mascot Bar & Live Stage',
    address: 'Neljäs linja 2',
    lat: 60.1808, lon: 24.9808,
    type: 'baari',
    subCategories: ['karaoke', 'klubi'],
    kuvaus: 'Kallion baari Neljännellä linjalla – karaokea, livekeikkoja ja klubi-iltoja pienellä lavalla.',
  },
  {
    id: 'curated-musta-harka',
    name: 'Musta Härkä',
    address: 'Mäkelänkatu 52',
    lat: 60.1892, lon: 24.9567,
    type: 'baari',
    subCategories: ['karaoke'],
    kuvaus: 'Mäkelänkadun karaokebaari – kantabaari, jossa lauletaan myöhään.',
  },
  {
    id: 'curated-kraken',
    name: 'Kraken Helsinki',
    address: 'Hietaniemenkatu 2',
    lat: 60.1650, lon: 24.9183,
    type: 'baari',
    subCategories: ['karaoke'],
    kuvaus: 'Karaokebaari Hietaniemenkadulla Kampin kupeessa.',
    www: 'https://krakenhelsinki.fi',
  },

  // ── Kattoklubit & rooftop ─────────────────────────────────────
  {
    id: 'curated-ateljee',
    name: 'Ateljee Bar',
    address: 'Yrjönkatu 26',
    lat: 60.1683, lon: 24.9417,
    type: 'baari',
    subCategories: ['katto'],
    kuvaus: 'Hotelli Tornin ylimmän kerroksen baari – Helsingin tunnetuin näköalabaari, jonne noustaan drinkin ja maiseman takia.',
  },
  {
    id: 'curated-monkey-rooftop',
    name: 'Monkey Rooftop Bar',
    address: 'Simonkatu 9',
    lat: 60.1692, lon: 24.9342,
    type: 'baari',
    subCategories: ['katto'],
    kuvaus: 'Simonkadun kattobaari Kampissa – drinkkejä ja DJ-iltoja kaupungin kattojen tasolla.',
  },
  {
    id: 'curated-bisoubisou',
    name: 'BISOUBISOU',
    address: 'Hermannin rantatie 9',
    lat: 60.1850, lon: 25.0025,
    type: 'baari',
    subCategories: ['katto'],
    kuvaus: 'Hermannin rantatien kattoterassi Kalasataman kupeessa – kesäinen rooftop-baari drinkkeineen ja DJ-setteineen.',
    www: 'https://bisoubisou.fi',
  },
  {
    id: 'curated-skyroom',
    name: 'Skyroom Helsinki',
    address: 'Tyynenmerenkatu 2',
    lat: 60.1567, lon: 24.8950,
    type: 'baari',
    subCategories: ['katto'],
    kuvaus: 'Jätkäsaaren kattobaari Tyynenmerenkadulla – näkymät satamaan ja merelle hotellin huipulta.',
  },
  {
    id: 'curated-loi-loi',
    name: 'Loi Loi Rooftop',
    address: 'Konepajankuja 5',
    lat: 60.1900, lon: 24.9458,
    type: 'baari',
    subCategories: ['katto'],
    kuvaus: 'Konepajan kattoterassi Vallilassa – kesäiltojen rooftop-baari.',
  },
]

/** Sama katu kahdessa osoitteessa: "Hämeentie 13 B" ~ "Hämeentie 13b",
 *  "Urho Kekkosen katu 4-6" ~ "Urho Kekkosen katu 6, sisäpiha". Vertaa vain
 *  katuosaa ennen talonumeroa, koska OSM:n ja tämän listan numeromuodot
 *  eroavat. Pelkkä nimi ei tunnista paikkaa (sama nimi voi olla eri kadulla),
 *  ja tämän listan koordinaatit eivät kelpaa tunnistukseen (ks. mittaus
 *  5.11.2026: Kaiku 2,5 km OSM-rivistä). */
export function samaKatu(a: string, b: string): boolean {
  const katu = (s: string) => s.split(/\d/)[0].toLowerCase().replace(/[^a-zäöå]+/g, ' ').trim()
  const ka = katu(a), kb = katu(b)
  return ka.length > 2 && ka === kb
}
