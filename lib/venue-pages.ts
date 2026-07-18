// Venue programme page config — drives /ohjelma/[venue] SEO pages and the sitemap.
// Two data mechanisms: tprekId → LinkedEvents location query (reliable, city venues),
// scrapedId → Supabase scraped_events table (populated nightly by the scrape-venues cron).

export interface VenuePage {
  slug: string
  name: string
  /** LinkedEvents location id, e.g. 'tprek:7258' */
  tprekId?: string
  /** scraped_events.venue_id */
  scrapedId?: string
  address: string
  www?: string
  /** 1-2 sentence Finnish description for meta + page intro */
  description: string
  /** schema.org type for JSON-LD */
  schemaType: 'MusicVenue' | 'EventVenue' | 'PerformingArtsTheater' | 'NightClub'
}

export const VENUE_PAGES: VenuePage[] = [
  {
    slug: 'tavastia',
    name: 'Tavastia',
    scrapedId: 'tavastia',
    address: 'Urho Kekkosen katu 4-6',
    www: 'https://tavastiaklubi.fi',
    description: 'Legendaarinen rockklubi Kampissa — Suomen tunnetuin keikkalava vuodesta 1970. Keikkoja lähes joka ilta.',
    schemaType: 'MusicVenue',
  },
  {
    slug: 'semifinal',
    name: 'Semifinal',
    scrapedId: 'semifinal',
    address: 'Urho Kekkosen katu 4-6',
    www: 'https://tavastiaklubi.fi',
    description: 'Tavastian pikkuveli samassa rakennuksessa — nousevien bändien ja indie-keikkojen koti.',
    schemaType: 'MusicVenue',
  },
  {
    slug: 'kaiku',
    name: 'Kaiku',
    scrapedId: 'kaiku',
    address: 'Kaikukatu 4',
    www: 'https://kaikuhelsinki.fi',
    description: 'Elektronisen musiikin klubi Sörnäisissä — teknoa, housea ja kansainvälisiä DJ-vieraita.',
    schemaType: 'NightClub',
  },
  {
    slug: 'on-the-rocks',
    name: 'On The Rocks',
    scrapedId: 'on-the-rocks',
    address: 'Mikonkatu 15',
    www: 'https://rocks.fi',
    description: 'Rockklubi Helsingin ytimessä Mikonkadulla — keikkoja ja klubi-iltoja viikon ympäri.',
    schemaType: 'MusicVenue',
  },
  {
    slug: 'storyville',
    name: 'Storyville',
    scrapedId: 'storyville',
    address: 'Eerikinkatu 2',
    www: 'https://storyville.fi',
    description: 'Helsingin jazzklubi — livejazzia, bluesia ja soulia useana iltana viikossa.',
    schemaType: 'MusicVenue',
  },
  {
    slug: 'korjaamo',
    name: 'Kulttuuritehdas Korjaamo',
    scrapedId: 'korjaamo',
    address: 'Töölönkatu 51 b',
    www: 'https://korjaamo.fi',
    description: 'Kulttuuritehdas Töölössä vanhassa raitiovaunuhallissa — keikkoja, teatteria, stand-upia ja tapahtumia.',
    schemaType: 'EventVenue',
  },
  {
    slug: 'savoy',
    name: 'Savoy-teatteri',
    tprekId: 'tprek:7258',
    address: 'Kasarmikatu 46-48',
    www: 'https://savoyteatteri.fi',
    description: 'Savoy-teatteri Kasarmikadulla — konsertteja ja esityksiä arvokkaassa funkkismiljöössä.',
    schemaType: 'PerformingArtsTheater',
  },
  {
    slug: 'malmitalo',
    name: 'Malmitalo',
    tprekId: 'tprek:8740',
    address: 'Ala-Malmin tori 1',
    www: 'https://malmitalo.fi',
    description: 'Malmin kulttuuritalo — konsertteja, elokuvia, näyttelyitä ja tapahtumia Koillis-Helsingissä.',
    schemaType: 'EventVenue',
  },
  {
    slug: 'vuotalo',
    name: 'Vuotalo',
    tprekId: 'tprek:7260',
    address: 'Mosaiikkitori 2',
    www: 'https://vuotalo.fi',
    description: 'Vuosaaren kulttuuritalo — konsertteja, teatteria, elokuvia ja näyttelyitä Itä-Helsingissä.',
    schemaType: 'EventVenue',
  },
]
