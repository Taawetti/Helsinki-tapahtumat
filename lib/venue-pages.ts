// Venue programme page config — drives /ohjelma/[venue] SEO pages and the sitemap.
// Three data mechanisms: tprekId → LinkedEvents location query (reliable, city venues),
// scrapedId → Supabase scraped_events table (populated nightly by the scrape-venues cron),
// lahde → lähdevarasto (lib/lahdevarasto): paikan oman skraperin tapahtumat, jotka
// kooste jo lukee varastosta. Lisätty 5.11.2026 (SEO-suunnitelma 2), koska
// esim. Kulttuuritalolla on LinkedEventsissä 6 tapahtumaa mutta varastossa 41.

import type { UlkoinenLahde } from '@/lib/lahdevarasto'

export interface VenuePage {
  slug: string
  name: string
  /** LinkedEvents location id, e.g. 'tprek:7258' */
  tprekId?: string
  /** scraped_events.venue_id */
  scrapedId?: string
  /** Lähdevaraston lähde (ULKOISET_LAHTEET), kun paikalla on oma skraperi. */
  lahde?: UlkoinenLahde
  /** Monen paikan lähteessä (esim. 'arenas') vain tämän paikan rivit —
   *  verrataan kanonisena nimenä (lib/paikannimet). */
  paikka?: string
  /** Otsikon tunnus; oletus 🎸 (keikkapaikka). */
  emoji?: string
  /** Sovelluksen hakusana, jolla sivu avaa sovellusnäkymän (oletus name).
   *  Lyhyempi muoto silloin, kun lähteiden paikannimi ei sisällä koko nimeä:
   *  skraperin rivit sanovat "Korjaamo", eivät "Kulttuuritehdas Korjaamo".
   *  Hakusanan on osuttava tapahtuman paikannimeen osajonona (HomeClient
   *  filteredEvents), muuten sovellusnäkymä jää tyhjäksi. */
  haku?: string
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
    haku: 'Korjaamo',
    scrapedId: 'korjaamo',
    address: 'Töölönkatu 51 b',
    www: 'https://korjaamo.fi',
    description: 'Kulttuuritehdas Töölössä vanhassa raitiovaunuhallissa — keikkoja, teatteria, stand-upia ja tapahtumia.',
    schemaType: 'EventVenue',
  },
  {
    slug: 'savoy',
    name: 'Savoy-teatteri',
    haku: 'Savoy',
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

  // ── Lisätty 5.11.2026: paikan oma skraperi lähdevarastossa ──────────────
  // Osoitteet ja verkkosivut tarkistettu 5.11.2026; www jätetty pois, jos
  // virallista osoitetta ei voitu varmistaa (väärä linkki on pahempi kuin ei
  // linkkiä — EventDetailPanel ja /api/venue-site käyttävät tätä kenttää).
  {
    slug: 'kulttuuritalo',
    name: 'Kulttuuritalo',
    lahde: 'kulttuuritalo',
    emoji: '🎶',
    address: 'Sturenkatu 4',
    www: 'https://kulttuuritalo.fi',
    description: 'Alvar Aallon suunnittelema Kulttuuritalo Alppilassa — konsertteja, keikkoja ja stand-upia yhdessä Helsingin arvostetuimmista saleista.',
    schemaType: 'MusicVenue',
  },
  {
    slug: 'g-livelab',
    name: 'G Livelab Helsinki',
    haku: 'G Livelab',
    lahde: 'glivelab',
    emoji: '🎷',
    address: 'Yrjönkatu 3',
    www: 'https://glivelab.fi',
    description: 'Intiimi musiikkiklubi Helsingin keskustassa — jazzia, maailmanmusiikkia, folkia ja indieä huippuluokan äänentoistolla.',
    schemaType: 'MusicVenue',
  },
  {
    slug: 'apollo',
    name: 'Apollo Live Club',
    lahde: 'apollo',
    emoji: '🪩',
    address: 'Mannerheimintie 16',
    description: 'Suuri klubi ja keikkapaikka Forumin korttelissa Kampissa — livekeikkoja, bilebändejä ja klubi-iltoja viikonloppuisin.',
    schemaType: 'NightClub',
  },
  {
    slug: 'maxine',
    name: 'Maxine',
    lahde: 'maxine',
    emoji: '🪩',
    address: 'Urho Kekkosen katu 1',
    description: 'Yökerho Kampin keskuksen kuudennessa kerroksessa — klubi-iltoja ja artistivierailuja näköalalla kaupungin ylle.',
    schemaType: 'NightClub',
  },
  {
    slug: 'post-bar',
    name: 'Post Bar',
    lahde: 'postbar',
    emoji: '🎛',
    address: 'Kaikukatu 2',
    description: 'Elektronisen musiikin klubi Sörnäisissä Kaikun sisäpihalla — housea, teknoa ja kansainvälisiä DJ-vieraita pienessä salissa.',
    schemaType: 'NightClub',
  },
  {
    slug: 'siltanen',
    name: 'Siltanen',
    lahde: 'siltanen',
    emoji: '🪩',
    address: 'Hämeentie 13 B',
    description: 'Kallion kulmakivi Hämeentiellä — päivisin baari ja iso terassi, viikonloppuisin DJ-klubi; samassa korttelissa Kuudes Linja.',
    schemaType: 'NightClub',
  },
  {
    slug: 'lepakkomies',
    name: 'Lepakkomies',
    lahde: 'lepakkomies',
    address: 'Helsinginkatu 1',
    description: 'Kallion rockbaari Helsinginkadulla — pieniä keikkoja, jameja ja klubi-iltoja lähes joka viikko.',
    schemaType: 'MusicVenue',
  },
  {
    slug: 'juttutupa',
    name: 'Juttutupa',
    lahde: 'juttutupa',
    emoji: '🎷',
    address: 'Säästöpankinranta 6',
    description: 'Hakaniemen perinteikäs ravintola vuodesta 1908 — ilmaisia jazz-, blues- ja rock’n’roll-keikkoja useana iltana viikossa.',
    schemaType: 'MusicVenue',
  },
  {
    slug: 'tanssin-talo',
    name: 'Tanssin talo',
    lahde: 'tanssintalo',
    emoji: '💃',
    address: 'Kaapeliaukio 3',
    www: 'https://tanssintalo.fi',
    description: 'Tanssin talo Kaapelitehtaalla Ruoholahdessa — nykytanssia, balettia ja tanssiteatteria kahdella näyttämöllä.',
    schemaType: 'PerformingArtsTheater',
  },
  {
    slug: 'kansallisteatteri',
    name: 'Kansallisteatteri',
    lahde: 'theatre',
    paikka: 'Kansallisteatteri',
    emoji: '🎭',
    address: 'Läntinen Teatterikuja 1',
    www: 'https://kansallisteatteri.fi',
    description: 'Suomen Kansallisteatteri Rautatientorin laidalla — kotimaista ja kansainvälistä näytelmätaidetta neljällä näyttämöllä vuodesta 1872.',
    schemaType: 'PerformingArtsTheater',
  },
  {
    slug: 'finlandia-talo',
    name: 'Finlandia-talo',
    lahde: 'arenas',
    paikka: 'Finlandia-talo',
    emoji: '🏛',
    address: 'Mannerheimintie 13 e',
    www: 'https://finlandiatalo.fi',
    description: 'Alvar Aallon Finlandia-talo Töölönlahdella — konsertteja, esityksiä ja suurtapahtumia vuonna 1971 valmistuneessa talossa.',
    schemaType: 'EventVenue',
  },
  {
    slug: 'messukeskus',
    name: 'Messukeskus',
    lahde: 'arenas',
    paikka: 'Messukeskus',
    emoji: '🏟',
    address: 'Messuaukio 1',
    www: 'https://messukeskus.com',
    description: 'Helsingin Messukeskus Pasilassa — messuja, konsertteja ja suurtapahtumia Suomen suurimmassa tapahtumakeskuksessa.',
    schemaType: 'EventVenue',
  },

  // ── Lisätty 5.11.2026: kaupungin talot LinkedEventsistä (tprek) ──────────
  {
    slug: 'musiikkitalo',
    name: 'Musiikkitalo',
    tprekId: 'tprek:20633',
    emoji: '🎻',
    address: 'Mannerheimintie 13 a',
    www: 'https://musiikkitalo.fi',
    description: 'Musiikkitalo Töölönlahdella — Helsingin kaupunginorkesterin, Radion sinfoniaorkesterin ja Sibelius-Akatemian koti; klassista, jazzia ja kevyttä musiikkia.',
    schemaType: 'MusicVenue',
  },
  {
    slug: 'stoa',
    name: 'Stoa',
    tprekId: 'tprek:7259',
    emoji: '🎭',
    address: 'Turunlinnantie 1',
    www: 'https://stoa.fi',
    description: 'Itä-Helsingin kulttuurikeskus Stoa Itäkeskuksessa — konsertteja, teatteria, tanssia, elokuvia ja näyttelyitä.',
    schemaType: 'EventVenue',
  },
  {
    slug: 'kanneltalo',
    name: 'Kanneltalo',
    tprekId: 'tprek:7255',
    emoji: '🎭',
    address: 'Klaneettitie 5',
    www: 'https://kanneltalo.fi',
    description: 'Kannelmäen kulttuuritalo Länsi-Helsingissä — konsertteja, teatteria, elokuvia ja näyttelyitä koko perheelle.',
    schemaType: 'EventVenue',
  },
  {
    slug: 'caisa',
    name: 'Caisa',
    tprekId: 'tprek:7256',
    emoji: '🌍',
    address: 'Kaikukatu 4',
    www: 'https://caisa.fi',
    description: 'Kulttuurikeskus Caisa Sörnäisissä — konsertteja, tanssia, teatteria ja keskusteluja eri kulttuureista.',
    schemaType: 'EventVenue',
  },
  {
    slug: 'annantalo',
    name: 'Annantalo',
    tprekId: 'tprek:7254',
    emoji: '🎨',
    address: 'Annankatu 30',
    www: 'https://annantalo.fi',
    description: 'Annantalo Kampissa — lasten ja nuorten taidekeskus: näyttelyitä, työpajoja, teatteria ja tapahtumia perheille.',
    schemaType: 'EventVenue',
  },
  {
    slug: 'oodi',
    name: 'Keskustakirjasto Oodi',
    haku: 'Oodi',
    tprekId: 'tprek:51342',
    emoji: '📚',
    address: 'Töölönlahdenkatu 4',
    www: 'https://oodihelsinki.fi',
    description: 'Keskustakirjasto Oodi Töölönlahdella — luentoja, keskusteluja, työpajoja, konsertteja ja lastentapahtumia joka päivä.',
    schemaType: 'EventVenue',
  },
  {
    slug: 'kaupunginteatteri',
    name: 'Helsingin Kaupunginteatteri',
    haku: 'Kaupunginteatteri',
    tprekId: 'tprek:9302',
    emoji: '🎭',
    address: 'Eläintarhantie 5',
    www: 'https://hkt.fi',
    description: 'Helsingin Kaupunginteatteri Eläintarhassa — musikaaleja, näytelmiä ja komedioita useilla näyttämöillä.',
    schemaType: 'PerformingArtsTheater',
  },
  {
    slug: 'kaapelitehdas',
    name: 'Kaapelitehdas',
    tprekId: 'tprek:9355',
    emoji: '🏭',
    address: 'Kaapeliaukio 3',
    www: 'https://kaapelitehdas.fi',
    description: 'Kaapelitehdas Ruoholahdessa — Suomen suurin kulttuurikeskus: näyttelyitä, festivaaleja, tanssia ja messuja vanhassa tehtaassa.',
    schemaType: 'EventVenue',
  },
  {
    slug: 'tiivistamo',
    name: 'Tiivistämö',
    tprekId: 'tprek:8099',
    address: 'Kaasutehtaankatu 1',
    description: 'Suvilahden Tiivistämö Sörnäisissä — keikkoja, klubeja ja nuorten tapahtumia vanhan kaasutehtaan alueella.',
    schemaType: 'MusicVenue',
  },
]
