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
}

export const HELSINKI_NIGHTCLUBS: CuratedVenue[] = [

  // ── Tekno & electronic ─────────────────────────────────────────
  {
    id: 'curated-kaiku',
    name: 'Kaiku',
    address: 'Kaikukatu 4',
    lat: 60.1617, lon: 24.9727,
    type: 'yokerho',
    subCategories: ['tekno'],
    www: 'https://kaikuhelsinki.fi',
  },
  {
    id: 'curated-aaniwalli',
    name: 'Ääniwalli',
    address: 'Pälkäneentie 13',
    lat: 60.1700, lon: 24.9367,
    type: 'yokerho',
    subCategories: ['tekno'],
  },
  {
    id: 'curated-post-bar',
    name: 'Post Bar',
    address: 'Kaikukatu 2',
    lat: 60.1616, lon: 24.9725,
    type: 'yokerho',
    subCategories: ['tekno'],
  },
  {
    id: 'curated-kult',
    name: 'KULT',
    address: 'Sturenkatu 4',
    lat: 60.1757, lon: 24.9560,
    type: 'yokerho',
    subCategories: ['tekno', 'klubi'],
  },
  {
    id: 'curated-pluto',
    name: 'Pluto',
    address: 'Uudenmaankatu 20',
    lat: 60.1552, lon: 24.9478,
    type: 'yokerho',
    subCategories: ['tekno', 'klubi'],
  },

  // ── Klubit & indie / alternative ──────────────────────────────
  {
    id: 'curated-kuudes-linja',
    name: 'Kuudes Linja',
    address: 'Hämeentie 13 B',
    lat: 60.1638, lon: 24.9752,
    type: 'yokerho',
    subCategories: ['klubi'],
    www: 'https://kuudeslinja.com',
  },
  {
    id: 'curated-siltanen',
    name: 'Siltanen',
    address: 'Hämeentie 13 B',
    lat: 60.1640, lon: 24.9750,
    type: 'yokerho',
    subCategories: ['klubi'],
  },
  {
    id: 'curated-tavastia',
    name: 'Tavastia',
    address: 'Urho Kekkosen katu 4-6',
    lat: 60.1686, lon: 24.9498,
    type: 'yokerho',
    subCategories: ['klubi'],
    www: 'https://tavastiaklubi.fi',
  },
  {
    id: 'curated-semifinal',
    name: 'Semifinal',
    address: 'Urho Kekkosen katu 4-6',
    lat: 60.1686, lon: 24.9498,
    type: 'yokerho',
    subCategories: ['klubi'],
  },
  {
    id: 'curated-on-the-rocks',
    name: 'On The Rocks',
    address: 'Mikonkatu 15',
    lat: 60.1688, lon: 24.9442,
    type: 'yokerho',
    subCategories: ['klubi'],
    www: 'https://rocks.fi',
  },
  {
    id: 'curated-bar-loose',
    name: 'Bar Loose',
    address: 'Annankatu 21',
    lat: 60.1660, lon: 24.9433,
    type: 'yokerho',
    subCategories: ['klubi'],
    www: 'https://barloose.com',
  },
  {
    id: 'curated-molly-malones',
    name: "Molly Malone's",
    address: 'Kaisaniemenkatu 1 C',
    lat: 60.1708, lon: 24.9442,
    type: 'yokerho',
    subCategories: ['klubi'],
    www: 'https://mollymalones.fi',
  },
  {
    id: 'curated-kaarle-xii',
    name: 'Kaarle XII',
    address: 'Kasarmikatu 40',
    lat: 60.1644, lon: 24.9600,
    type: 'yokerho',
    subCategories: ['klubi'],
  },
  {
    id: 'curated-maxine',
    name: 'Maxine',
    address: 'Urho Kekkosen katu 1',
    lat: 60.1688, lon: 24.9483,
    type: 'yokerho',
    subCategories: ['klubi'],
  },
  {
    id: 'curated-tanner',
    name: 'Tanner',
    address: 'Hämeentie 11',
    lat: 60.1633, lon: 24.9742,
    type: 'yokerho',
    subCategories: ['klubi'],
  },
  {
    id: 'curated-g-livelab',
    name: 'G Livelab',
    address: 'Yrjönkatu 3',
    lat: 60.1667, lon: 24.9500,
    type: 'yokerho',
    subCategories: ['klubi'],
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
  },
  {
    id: 'curated-holiday-karaoke',
    name: 'Holiday Karaoke',
    address: 'Iso Roobertinkatu 2',
    lat: 60.1638, lon: 24.9417,
    type: 'baari',
    subCategories: ['karaoke'],
  },
  {
    id: 'curated-wallis-karaoke',
    name: 'Wallis Karaoke',
    address: 'Kanavaranta 7',
    lat: 60.1683, lon: 24.9600,
    type: 'baari',
    subCategories: ['karaoke'],
  },
  {
    id: 'curated-erottaja-bar',
    name: 'Erottaja Bar',
    address: 'Erottajankatu 15-17',
    lat: 60.1638, lon: 24.9467,
    type: 'baari',
    subCategories: ['karaoke'],
  },
  {
    id: 'curated-karaokebar-populus',
    name: 'Karaokebar Populus',
    address: 'Aleksis Kiven katu 22',
    lat: 60.1722, lon: 24.9733,
    type: 'baari',
    subCategories: ['karaoke'],
  },
  {
    id: 'curated-ake-karaoke',
    name: 'Åke Karaoke',
    address: 'Erottajankatu 2',
    lat: 60.1640, lon: 24.9460,
    type: 'baari',
    subCategories: ['karaoke'],
  },
  {
    id: 'curated-mascot',
    name: 'Mascot Bar & Live Stage',
    address: 'Neljäs linja 2',
    lat: 60.1808, lon: 24.9808,
    type: 'baari',
    subCategories: ['karaoke', 'klubi'],
  },
  {
    id: 'curated-musta-harka',
    name: 'Musta Härkä',
    address: 'Mäkelänkatu 52',
    lat: 60.1892, lon: 24.9567,
    type: 'baari',
    subCategories: ['karaoke'],
  },
  {
    id: 'curated-kraken',
    name: 'Kraken Helsinki',
    address: 'Hietaniemenkatu 2',
    lat: 60.1650, lon: 24.9183,
    type: 'baari',
    subCategories: ['karaoke'],
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
  },
  {
    id: 'curated-monkey-rooftop',
    name: 'Monkey Rooftop Bar',
    address: 'Simonkatu 9',
    lat: 60.1692, lon: 24.9342,
    type: 'baari',
    subCategories: ['katto'],
  },
  {
    id: 'curated-bisoubisou',
    name: 'BISOUBISOU',
    address: 'Hermannin rantatie 9',
    lat: 60.1850, lon: 25.0025,
    type: 'baari',
    subCategories: ['katto'],
    www: 'https://bisoubisou.fi',
  },
  {
    id: 'curated-skyroom',
    name: 'Skyroom Helsinki',
    address: 'Tyynenmerenkatu 2',
    lat: 60.1567, lon: 24.8950,
    type: 'baari',
    subCategories: ['katto'],
  },
  {
    id: 'curated-loi-loi',
    name: 'Loi Loi Rooftop',
    address: 'Konepajankuja 5',
    lat: 60.1900, lon: 24.9458,
    type: 'baari',
    subCategories: ['katto'],
  },
]
