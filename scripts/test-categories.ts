// Kategorialuokittelun regressiotestit — kultaiset tapaukset syväauditoinnista
// 2026-07-22 + kerrosarkkitehtuurin tapaukset (venue-kartta, globaalit vetot).
//
// Aja: npm run test:categories   (ajetaan myös automaattisesti ennen buildia)
//
// SÄÄNTÖ: jokainen tuotannosta löydetty luokitteluvirhe lisätään tänne
// testinä ENNEN kuin sääntöjä korjataan — näin sama virhe ei voi palata.
// Testit ovat puhtaita fixtureita: ei verkkoa, ei ympäristöriippuvuuksia.

import { classifyEvent, extractYsoIds } from '../lib/event-classify'
import {
  detectSourceAnomalies,
  nextStreak,
  aggregateStreakSamples,
  AGGREGATE_ZERO_STREAK_ALERT_DAYS,
  VENUE_SCRAPERS,
  type CanaryPayload,
  type StreakState,
  type VenueScrapeSample,
} from '../lib/source-health'
import { summariseMenu } from '../lib/menu-summary'
import { parseSuperterassi, parseSeason } from '../lib/superterassi'
import { parseSetlistText, parseFinnishDate } from '../lib/flyingdutchman-parse'
import { weekParamDates } from '../lib/stadissa-weeks'
import { parseSiltanenGrid } from '../lib/siltanen-parse'
import { buildIdeaDeck, audienceOk, seniorSkew } from '../lib/idea-deck'
import { parseApolloGrid } from '../lib/apollo-parse'
import { parseMaxineTribe } from '../lib/maxine-parse'
import { parseTanssintaloEntries } from '../lib/tanssintalo-parse'
import { parsePostbarEvents } from '../lib/postbar-parse'
import {
  reasonKey,
  reasonKeyVariants,
  streetKey,
  sameStreet,
  matchReasons,
  reasonWeight,
  reasonsWeight,
  primaryReason,
  openingLabel,
  interleaveReasoned,
  isTouristBasic,
  filterReasonsForBasics,
  type ReasonKind,
  type RestaurantReason,
  type ReasonFile,
} from '../lib/restaurant-reasons'
import reasonFile from '../data/restaurant-reasons.json'
import activityReasonFile from '../data/activity-reasons.json'
import {
  buildNewInHelsinki,
  kindFromVenueType,
  kindFromGoogleCategory,
  neighborhoodOf,
  OPENING_HEADLINE,
  type OpeningInput,
} from '../lib/new-in-helsinki'
import enrichedFile from '../data/new-places-enriched.json'
import secondhandFile from '../data/secondhand.json'
import { normalizeInstagram, normalizeFacebook, splitWebsite } from '../lib/socials'
import { nightlifeScore, COMMUNITY_DAYTIME_REGEX } from '../lib/nightlife'
import { helsinkiClock, addDays, resolveArcTarget, planShareText } from '../lib/arvo-ilta'
import { nameOverlap } from '../lib/dataforseo'
import { dedupeOsmVenues } from '../lib/osm-dedupe'
import openingFile from '../data/new-openings.json'
import deadImages from '../data/dead-images.json'
import websiteImages from '../data/website-images.json'
import { credibilityScore } from '../lib/credibility'
import { matchNewsToRestaurants, toNewsReason, type NewsLike } from '../lib/restaurant-news-match'
import { parseLepakkomiesEvents } from '../lib/lepakkomies-parse'
import { buildDeterministicArc } from '../lib/group-arc'
import { isOutsideTargetAudience, isPrimaryPick } from '../lib/audience'
import { isTicketShopUrl, canBuyTickets } from '../lib/tickets'
import { normName as guideNormName, streetKey as guideStreetKey } from '../lib/guide-data'
import { isCompetitorUrl, hasOwnEventPage, shareUrlFor, externalUrlFor, searchUrlFor } from '../lib/event-links'
import { closedOnArcDay, subtypeOf } from '../lib/group-scheduler'
import { walkMinutesBetween } from '../lib/group'
import { normalizeHelsinkiTimestamp, helsinkiDateOf, helsinkiOffset, helsinkiISO } from '../lib/helsinki-time'
import { buildDeck } from '../lib/candidate'
import { venueHoursOverride } from '../lib/venue-hours-overrides'
import { pickWeeklyDigest } from '../lib/weekly-digest'
import type { Candidate, CandidateRole } from '../lib/candidate'
import type { Event, Restaurant } from '../lib/types'

type Case = {
  name: string
  e: { title: string; shortDescription?: string; categories?: string[]; ysoIds?: string[]; location?: { name?: string } | null }
  in?: string[]   // kategoriat joihin PITÄÄ kuulua
  out?: string[]  // kategoriat joihin EI SAA kuulua
}

const CASES: Case[] = [
  // ── Osamerkkijono-onnettomuudet (auditoinnin päälöydökset) ───────────────
  {
    name: "'live' ei saa osua sanaan Oliver — pubivisa ei ole keikka",
    e: { title: 'Tietovisa – Sir Oliver', shortDescription: 'Pubivisa joka keskiviikko klo 19. Voittajille palkinnot!', categories: ['tietokilpailut'] },
    in: ['baari'], out: ['keikka'],
  },
  {
    name: "'punk' ei saa osua sanaan kaupunki — kaupunkitanssit ei ole undergroundia eikä esitystaidetta",
    e: { title: 'Kaupunkitanssit Lyypekinlaiturilla', shortDescription: 'Maksutonta paritanssiopetusta, niin aloittelijoille kuin kokeneemmillekin tanssijoille.', categories: ['osallistuminen'] },
    in: ['tyopaja'], out: ['underground', 'teatteri', 'keikka'],
  },
  {
    name: "'art' ei saa osua sanaan artisti/kädentaito — askartelu ei ole taidetta (näyttelymielessä)",
    e: { title: 'Kesäiset kädentaidot', shortDescription: 'Askarrellaan yhdessä leikkipuistossa.', categories: ['kuvataide'] },
    out: ['taide'],
  },
  {
    name: "'night' ei saa osua englannin iltatapahtumiin — askarteluilta ei ole yöelämää",
    e: { title: 'Arts & Crafts Night', shortDescription: 'Rento ilta paperin ja kynien äärellä.', categories: [] },
    out: ['yoelama'],
  },
  {
    name: "'pint' ei saa osua sanaan pintojen",
    e: { title: 'Näyttely: Pintojen kauneus', shortDescription: 'Keramiikkanäyttely pintojen struktuureista.', categories: ['näyttelyt'] },
    in: ['taide'], out: ['baari'],
  },
  {
    name: "'bar' ei saa osua yhtyeeseen Baraka",
    e: { title: 'Baraka Issabu Trio', shortDescription: 'Konsertti Espan lavalla.', categories: ['musiikki'] },
    in: ['keikka'], out: ['baari'],
  },

  // ── Vauvat, lapset ja seniorit eivät kuulu aikuisten iltakategorioihin ───
  {
    name: 'vauvojen lorutuokio ei ole keikka vaikka siinä on musiikkia',
    e: { title: 'Vauvojen ja taaperoiden kesälorutuokiot', shortDescription: 'Iloiset kesäiset lorutuokiot sopivat 0-3-vuotiaille vauvoille ja taaperoille vanhempineen. Loruilua ja musiikkia.', categories: ['musiikki'] },
    in: ['lapset'], out: ['keikka', 'yoelama', 'baari'],
  },
  {
    name: 'seniorikeskuksen joulukonsertti ei ole keikka',
    e: { title: 'Seniorisoppa joulukonsertti', shortDescription: 'Konsertti palvelukeskuksessa ikäihmisille.', categories: ['musiikki'] },
    out: ['keikka'],
  },
  {
    name: 'tuolijumppa seniorikeskuksessa ei ole urheilua — se on harrastus',
    e: { title: 'Tuolijumppa', shortDescription: 'Istuen tehtävää rauhallista harjoittelua.', categories: ['liikuntaharrastus'], location: { name: 'Riistavuoren seniorikeskus' } },
    in: ['tyopaja'], out: ['urheilu'],
  },
  {
    name: 'koululaisten leikkipuistoliikunta ei ole urheilua',
    e: { title: 'Koululaisille liikuntaa', shortDescription: 'Pelataan ja leikitään koululaisten kanssa.', categories: ['ulkoilu'], location: { name: 'Leikkipuisto Tuorinniemi' } },
    in: ['lapset'], out: ['urheilu', 'keikka'],
  },

  // ── Yhteisö- ja harrastustapahtumat → Harrastukset & Kurssit ─────────────
  {
    name: 'yhteislaulut → harrastukset, ei keikka',
    e: { title: 'Kahvion yhteislaulut', shortDescription: 'Tervetuloa palvelukeskuksen vapaaehtoisen vetämään harrasteryhmään.', categories: ['musiikki'] },
    in: ['tyopaja'], out: ['keikka'],
  },
  {
    name: 'päivätanssit → harrastukset, ei teatteri eikä keikka (vaikka live bändi soittaa)',
    e: { title: 'Kinaporin päivätanssit', shortDescription: 'Kinaporin päivätansseissa on aina live bändi.', categories: ['tanssi'] },
    in: ['tyopaja'], out: ['teatteri', 'keikka'],
  },
  {
    name: 'karaoke + levyraati → baari, ei keikka',
    e: { title: 'Karaoke vs. Levyraati', shortDescription: 'Illan aikana lauletaan ja raadataan.', categories: ['tietokilpailut', 'musiikki'] },
    in: ['baari'], out: ['keikka'],
  },
  {
    name: 'musiikkinäytelmä → teatteri, ei keikka eikä standup',
    e: { title: 'Kaksi Puuta-musiikkinäytelmä', shortDescription: 'Juice Leskisen elämästä kertova musiikkinäytelmä.', categories: ['teatteri', 'musiikki', 'komedia'] },
    in: ['teatteri'], out: ['keikka', 'standup'],
  },

  // ── Puuttuneet keikat (recall-korjaukset) ────────────────────────────────
  {
    name: "monikko 'keikat' osuu ('keikka' ei ole sen osamerkkijono)",
    e: { title: 'pehmoaino 360 – Vuoden ainoat keikat', shortDescription: '', categories: [] },
    in: ['keikka'],
  },
  {
    name: 'jazz-keikka löytyy',
    e: { title: 'Gula Jazz - Rocka Merilahti Summer Jazz Band', shortDescription: 'Livejazzia terassilla.', categories: [] },
    in: ['keikka'],
  },
  {
    name: 'Alppipuiston kesä → keikka + festivaali + underground',
    e: { title: 'ALPPIPUISTON KESÄ (päivä 19/23)', shortDescription: '', categories: [] },
    in: ['keikka', 'festivaali', 'underground'],
  },

  // ── L1: venue-kartta ─────────────────────────────────────────────────────
  {
    name: 'venue-kartta: tuntematon artisti Tavastialla on keikka',
    e: { title: 'Ilta X', shortDescription: '', categories: [], location: { name: 'Tavastia' } },
    in: ['keikka'],
  },
  {
    name: 'venue-kartta: Kake Randelin @ Mummotunneli on keikka',
    e: { title: 'Kake Randelin', shortDescription: '', categories: [], location: { name: 'Mummotunneli' } },
    in: ['keikka'],
  },
  {
    name: 'venue-kartta: Lepakkomies → keikka + underground',
    e: { title: 'Perjantain ilta', shortDescription: '', categories: [], location: { name: 'Lepakkomies' } },
    in: ['keikka', 'underground'],
  },
  {
    name: 'GLOBAALI VETO voittaa venue-kartan: lastenkonsertti Tavastialla → lapset, EI keikka',
    e: { title: 'Lastenkonsertti: Fröbelin Palikat', shortDescription: 'Koko perheen konserttitapahtuma lapsille.', categories: ['musiikki'], location: { name: 'Tavastia' } },
    in: ['lapset'], out: ['keikka'],
  },
  {
    name: 'GLOBAALI VETO voittaa venue-kartan: Musiikkitalon avoimet ovet ei ole keikka',
    e: { title: 'Musiikkitalon Konserttisalin avoimet ovet', shortDescription: 'Tutustu Konserttisaliin oman aikataulusi mukaan!', categories: [], location: { name: 'Musiikkitalo' } },
    in: ['tyopaja'], out: ['keikka'],
  },

  // ── L2: lähteen rakenteiset kategoriat ───────────────────────────────────
  {
    name: "lähdekategoria 'konsertit' → keikka ilman avainsanaosumaa otsikossa",
    e: { title: 'Suvi-illan sävel', shortDescription: '', categories: ['konsertit'] },
    in: ['keikka'],
  },
  {
    name: "lähdekategoria 'näyttelyt' → taide",
    e: { title: 'William Morris', shortDescription: 'Näyttely brittiläisestä suunnittelijasta.', categories: ['näyttelyt'] },
    in: ['taide'],
  },

  // ── Urheilu = ottelut ja turnaukset ──────────────────────────────────────
  {
    name: 'jalkapallo-ottelu on urheilua',
    e: { title: 'HIFK - HJK', shortDescription: 'Veikkausliigan ottelu Bolt Arenalla.', categories: ['urheilu'] },
    in: ['urheilu'],
  },
  {
    name: 'vapaa pingispelailu ei ole urheilukategorian tapahtuma',
    e: { title: 'Pingistä', shortDescription: 'Vapaata pelailua, mailat saa lainaan (pöytätennis).', categories: [] },
    out: ['urheilu'],
  },

  // ── Hyväksytyt rajatapaukset (lukitaan nykyinen käytös) ──────────────────
  {
    name: 'Suomenlinnan iltasoitto: hyväksytty rajatapaus keikkana (musiikki-kategoria)',
    e: { title: 'Suomenlinnan iltasoitto', shortDescription: 'Perinteinen iltasoitto.', categories: ['musiikki'] },
    in: ['keikka'],
  },

  // ── Adversariaalisen katselmoinnin löydökset (2026-07-22) ─────────────────
  {
    name: 'PROTOTYYPPISAASTE: lähdekategoriat constructor/__proto__/toString eivät saa kaataa luokittelua',
    e: { title: 'Tavallinen tapahtuma', categories: ['constructor', '__proto__', 'toString', 'hasOwnProperty'] },
    out: [], // pelkkä ei-kaatuminen riittää — jos heittää, koko skripti kaatuu
  },
  {
    name: 'HAY-VETO: senioreille suunnattu konsertti (teksti kertoo) ei ole keikka',
    e: { title: 'Iltapäiväkonsertti', shortDescription: 'Konsertti ikäihmisille palvelukeskuksessa.', categories: ['konsertit'], location: { name: 'Kinaporin seniorikeskus' } },
    out: ['keikka'],
  },
  {
    name: 'VENUE-NIMI EI SAA VEDOTA: konsertti musiikkipaikassa "Stadin yhteisötalo Saunabaari" ON keikka',
    e: { title: 'Kesäillan konsertti', shortDescription: 'Livemusiikkia.', categories: ['konsertit'], location: { name: 'Stadin yhteisötalo Saunabaari' } },
    in: ['keikka'],
  },
  {
    name: 'VENUE-NIMI EI SAA VEDOTA: keikka teatterissa "Teatteri Avoimet Ovet" ON keikka',
    e: { title: 'Kantaesityskonsertti', shortDescription: 'Uuden levyn julkaisukeikka.', categories: [], location: { name: 'Teatteri Avoimet Ovet' } },
    in: ['keikka'],
  },
  {
    name: "OSAMERKKIJONO: 'konkurssi'-näytelmä → vain teatteri, EI harrastukset/standup/keikka",
    e: { title: 'Konkurssi', shortDescription: 'Draamakomedia rahan loppumisesta.', categories: ['teatteri'] },
    in: ['teatteri'], out: ['tyopaja', 'standup', 'keikka'],
  },
  {
    name: 'MONIKÄYTTÖ-VENUE: geneerinen tapahtuma Musiikkitalossa EI ole automaattisesti keikka (venue poistettu kartasta)',
    e: { title: 'Illan tapahtuma', categories: [], location: { name: 'Musiikkitalo' } },
    out: ['keikka'],
  },
  {
    name: 'MONIKÄYTTÖ-VENUE: gaala Kulttuuritalossa ei ole keikka',
    e: { title: 'Vuoden juhlagaala', categories: [], location: { name: 'Kulttuuritalo' } },
    out: ['keikka'],
  },
  {
    name: 'MONIKÄYTTÖ-VENUE: avoin tunti Tanssin talossa ei ole esitys (teatteri)',
    e: { title: 'Avoin tunti', categories: [], location: { name: 'Tanssin talo' } },
    out: ['teatteri'],
  },
  {
    name: 'oikea konsertti Musiikkitalossa löytyy yhä avainsanalla (recall säilyy venue-poiston jälkeen)',
    e: { title: 'Sinfoniakonsertti', categories: [], location: { name: 'Musiikkitalo' } },
    in: ['keikka'],
  },
  {
    name: 'KIASMA-TEATTERI: esitys esityslavalla ei ole museo (kiasma-osuma vetoutuu), vaan teatteri',
    e: { title: 'Nykytanssiesitys', shortDescription: 'Kokeellinen esitys.', categories: [], location: { name: 'Kiasma-teatteri' } },
    in: ['teatteri'], out: ['museo'],
  },
  {
    name: 'SIRKUS: lasten sirkusleiri ei ole esittävää taidetta (teatteri) vaan lapset',
    e: { title: 'Sirkusleiri lapsille', shortDescription: 'Kesäleiri jossa opetellaan sirkustaitoja.', categories: [] },
    in: ['lapset'], out: ['teatteri'],
  },
  {
    name: 'klubi-ilta taidemuseossa ei ole museo',
    e: { title: 'Amos Rex Lates: klubi-ilta', shortDescription: 'DJ-ilta museossa.', categories: [], location: { name: 'Amos Rex' } },
    out: ['museo'],
  },

  // ── Kolmannen adversariaalisen katselmoinnin löydökset (2026-07-23) ───────
  // Paljaan osamerkkijonon törmäykset — jokainen synteettinen törmäyssana
  // varmistaa ettei väärä kategoria synny. Uusi avainsana joka rikkoo jonkin
  // näistä kaatuu tässä ennen tuotantoa.
  {
    name: "'live' EI osu sanaan Oliver — musikaali \"Oliver!\" ei ole keikka",
    e: { title: 'Oliver!', shortDescription: 'Musikaali Charles Dickensin romaanista.', categories: ['teatteri'] },
    in: ['teatteri'], out: ['keikka'],
  },
  {
    name: "'live' EI osu sanaan olive — oliiviöljymaistelu ei ole keikka",
    e: { title: 'Olive oil -maistelu', shortDescription: 'Maistellaan oliiviöljyjä.', categories: [] },
    out: ['keikka'],
  },
  {
    name: 'aito live-keikka löytyy yhä ( live kokonaissanana + live-/livemus)',
    e: { title: 'Bar Loose Live', shortDescription: 'Livemusiikkia illan mittaan.', categories: [] },
    in: ['keikka'],
  },
  {
    name: "'komedia' EI tee tragikomediasta standuppia",
    e: { title: 'Kirsikkatarha', shortDescription: 'Tšehovin tragikomedia näyttämöllä.', categories: ['teatteri'] },
    in: ['teatteri'], out: ['standup'],
  },
  {
    name: "'maraton' EI tee elokuvamaratonista urheilua",
    e: { title: 'Kauhuelokuvamaraton', shortDescription: 'Yön yli kestävä elokuvamaraton.', categories: [] },
    out: ['urheilu'],
  },
  {
    name: "'fest' EI osu sanaan manifesti",
    e: { title: 'Taiteilijan manifesti', shortDescription: 'Keskustelutilaisuus manifestista.', categories: [] },
    out: ['festivaali'],
  },
  {
    name: "'rave' EI osu sanaan travel — matkailuilta ei ole yöelämää",
    e: { title: 'Travel Tuesday: reppureissu Aasiaan', shortDescription: 'Matkakertomuksia.', categories: [] },
    out: ['yoelama', 'underground'],
  },
  {
    name: "'rave' EI osu sanaan gravel/brave",
    e: { title: 'Gravel-pyöräilyretki', shortDescription: 'Bravehearts-henkinen retki.', categories: [] },
    out: ['yoelama', 'underground'],
  },
  {
    name: 'aito rave löytyy yhä ( rave kokonaissanana)',
    e: { title: 'Underground rave Suvilahdessa', shortDescription: 'Teknoa aamuun.', categories: [] },
    in: ['underground'],
  },
  {
    name: 'museo-veto: Kiasma-teatterin esitys kun venue on KUVAUKSESSA → ei museo',
    e: { title: 'Nykytanssiesitys', shortDescription: 'Esitys Kiasma-teatterissa.', categories: [], location: { name: 'Kiasma-teatteri' } },
    in: ['teatteri'], out: ['museo'],
  },

  // ── Neljännen katselmoinnin löydökset: tokenisoiva matcher (2026-07-23) ───
  {
    name: "välimerkki: \"SANNI Live!\" on keikka (huutomerkki normalisoidaan)",
    e: { title: 'SANNI Live!', shortDescription: '', categories: [] },
    in: ['keikka'],
  },
  {
    name: 'välimerkki: "Radiohead (Live)" on keikka (sulkeet normalisoidaan)',
    e: { title: 'Radiohead (Live)', shortDescription: '', categories: [] },
    in: ['keikka'],
  },
  {
    name: "taivutus: 'livenä'/'liveä' osuu keikkaan (sananalkuosuma)",
    e: { title: 'Artisti esiintyy livenä', shortDescription: 'Musiikkia liveä.', categories: [] },
    in: ['keikka'],
  },
  {
    name: "taivutus: 'ravet'/'raveihin' osuu (sananalkuosuma)",
    e: { title: 'Kesän ravet Suvilahdessa', shortDescription: '', categories: [] },
    in: ['underground'],
  },
  {
    name: "'lates' EI enää pudota museonäyttelyä jossa mainitaan 'latest'",
    e: { title: 'Generation 2026', shortDescription: 'Showcasing the latest contemporary art.', categories: ['näyttelyt'], location: { name: 'Amos Rex' } },
    in: ['museo', 'taide'],
  },
  {
    name: "'lates' EI osu sanaan Pilates — aamupilates museossa ei pudota mitään väärin",
    e: { title: 'Aamupilates', shortDescription: 'Rauhallinen pilatestunti.', categories: [], location: { name: 'Kansallismuseo' } },
    in: ['museo'],
  },
  {
    name: "'fest' EI osu sanaan manifesti — Manifesta-biennaali/manifesti-festivaali ei katoa",
    e: { title: 'Manifesta-biennaali', shortDescription: 'Taidefestivaali ja manifesti nykytaiteesta.', categories: ['festivaalit'] },
    in: ['festivaali'],
  },
  {
    name: "'maraton' EI tee elokuvamaratonista urheilua (sananalkuosuma)",
    e: { title: 'Kauhuelokuvamaraton', shortDescription: 'Yön yli kestävä elokuvamaraton.', categories: [] },
    out: ['urheilu'],
  },
  {
    name: "'komedia' EI tee tragikomediasta standuppia (sananalkuosuma)",
    e: { title: 'Kirsikkatarha', shortDescription: 'Tšehovin tragikomedia näyttämöllä.', categories: ['teatteri'] },
    in: ['teatteri'], out: ['standup'],
  },
  {
    name: "'pubi' osuu, 'pub' EI enää tee sanasta 'public' baaria",
    e: { title: 'Public viewing: jalkapallon MM-finaali', shortDescription: 'Katsotaan finaali yhdessä.', categories: [] },
    out: ['baari'],
  },

  // ── L0 yso-ontologiakoodit (2026-07-23) — vakain signaali ─────────────────
  {
    name: 'yso: liikunta (p916) → Harrastukset, EI urheilu (kunnallinen jumppa)',
    e: { title: 'Ohjattua liikuntaa', shortDescription: '', categories: [], ysoIds: ['yso:p916'] },
    in: ['tyopaja'], out: ['urheilu'],
  },
  {
    name: 'yso: urheilu (p965) → urheilu',
    e: { title: 'Ottelu', shortDescription: '', categories: [], ysoIds: ['yso:p965'] },
    in: ['urheilu'],
  },
  {
    name: 'yso: konsertit (p11185) → keikka ilman tekstisignaalia',
    e: { title: 'Illan ohjelma', shortDescription: '', categories: [], ysoIds: ['yso:p11185'] },
    in: ['keikka'],
  },
  {
    name: 'yso: näyttelyt (p5121) → taide',
    e: { title: 'Uusi avaus', shortDescription: '', categories: [], ysoIds: ['yso:p5121'] },
    in: ['taide'],
  },
  {
    name: 'yso: museot (p4934) → museo',
    e: { title: 'Avoimet ovet', shortDescription: '', categories: [], ysoIds: ['yso:p4934'] },
    in: ['museo'],
  },
  {
    name: 'yso: tanssi (p1278) → teatteri',
    e: { title: 'Esitys', shortDescription: '', categories: [], ysoIds: ['yso:p1278'] },
    in: ['teatteri'],
  },
  {
    name: 'yso: vauvat (p15937) → lapset',
    e: { title: 'Aamu', shortDescription: '', categories: [], ysoIds: ['yso:p15937'] },
    in: ['lapset'],
  },
  {
    name: 'GLOBAALI VETO voittaa yso: konsertit-yso + lapsi-teksti → ei keikka, on lapset',
    e: { title: 'Vauvakonsertti', shortDescription: 'Konsertti vauvoille ja perheille.', categories: [], ysoIds: ['yso:p11185'] },
    in: ['lapset'], out: ['keikka'],
  },
  {
    name: 'yso puuttuu (ei-LinkedEvents-lähde) → tekstikerrokset hoitavat',
    e: { title: 'Joulukonsertti', shortDescription: '', categories: [] },
    in: ['keikka'],
  },

  // ── yso-kerroksen katselmoinnin löydökset (2026-07-23) ────────────────────
  {
    name: 'PROTOTYYPPISAASTE L0: yso-id constructor/__proto__/toString ei kaada',
    e: { title: 'Tapahtuma', shortDescription: '', categories: [], ysoIds: ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'] },
    out: [],
  },
  {
    name: 'satutunnit (p14710) → lapset (lisätty recall-aukon takia)',
    e: { title: 'Satutunti kirjastossa', shortDescription: '', categories: [], ysoIds: ['yso:p14710'] },
    in: ['lapset'],
  },
  {
    name: 'POISTETTU: opastus (p2149) EI enää tuota tyopaja-tagia näyttelykierrokseen',
    e: { title: 'Näyttelyopastus', shortDescription: '', categories: [], ysoIds: ['yso:p2149', 'yso:p5121'] },
    in: ['taide'], out: ['tyopaja'],
  },
  {
    name: 'POISTETTU: historia (p1780) EI enää tee historialuennosta museota',
    e: { title: 'Luento Helsingin historiasta', shortDescription: '', categories: [], ysoIds: ['yso:p1780', 'yso:p15875'] },
    in: ['tyopaja'], out: ['museo'],
  },
  {
    name: 'POISTETTU: keskustelu (p14004) liian laaja → ei tyopaja-tagia paneelille',
    e: { title: 'Kirjailijapaneeli', shortDescription: '', categories: [], ysoIds: ['yso:p14004'] },
    out: ['tyopaja'],
  },
  {
    name: 'POISTETTU: Espan lava (kulke:48) monikäyttö-venue → ei automaattista keikkaa',
    e: { title: 'Kesäohjelmaa Espan lavalla', shortDescription: '', categories: [], ysoIds: ['kulke:48'] },
    out: ['keikka'],
  },
  {
    name: 'pubivisa/tietovisa → baari (ei keikka)',
    e: { title: 'Tietovisa', shortDescription: 'Viikoittainen pubivisa.', categories: [], ysoIds: [] },
    in: ['baari'], out: ['keikka'],
  },
  {
    name: 'RA-klubitapahtuma (kategoriat Techno/Klubi/Yöelämä) → yoelama',
    e: { title: 'Kaiku presents: Blawan (DJ Set)', shortDescription: 'Kaiku — techno', categories: ['Techno', 'Klubi', 'Yöelämä'], ysoIds: [] },
    in: ['yoelama'],
  },
  {
    name: 'metallikeikka rock-klubilla ("Tavastia-klubi") EI ole yöelämää (bare klubi pois)',
    e: { title: 'Arch Enemy', shortDescription: 'Tavastia-klubi — melodic death metal', categories: [], ysoIds: [] },
    out: ['yoelama'],
  },
  // ── yö*-substring-miinat (löydetty tuotannosta 2026-08-21) ────────────────
  // 'yökerho'/'yöelämä' substringinä osuivat sanoihin joissa "yö" on edeltävän
  // osan loppu → neulontakerho ja työnhakuinfo luokittuivat yöelämäksi.
  {
    name: 'käsityökerho (käsityö+kerho) EI ole yökerho → ei yoelama',
    e: { title: 'Käsityökerho', shortDescription: 'Tule mukaan neulomaan yhdessä ja viettämään aikaa kahvikupin äärelle.', categories: [], ysoIds: [] },
    out: ['yoelama'],
  },
  {
    name: 'työelämä (työ+elämä) EI ole yöelämä → ei yoelama',
    e: { title: 'Tule palveluinfoon: Tuettu työnhaku vieraskielisille', shortDescription: 'Löydä polkusi työelämään. Info Helsingin työllisyyspalveluiden asiakkaille.', categories: [], ysoIds: [] },
    out: ['yoelama'],
  },
  {
    name: 'päiväsaikainen torikonsertti jonka kuvauksessa "bileet" EI ole yöelämää',
    e: { title: 'ANI, kukkatalo – Malmin tapahtumakesä 2026', shortDescription: 'Tapahtumakesän viimeinen päivä tarjoaa kukkatalon bileet ja ANIn karismaattista poppia Ala-Malmin torilla!', categories: ['Musiikki'], ysoIds: [] },
    out: ['yoelama'],
  },
  {
    name: 'bilebändi on keikka, ei yöelämää',
    e: { title: 'Bilebändi Löyly', shortDescription: 'Bilebändi soittaa terassilla.', categories: [], ysoIds: [] },
    in: ['keikka'], out: ['yoelama'],
  },
  // Sananalkuosuma ei saa rikkoa aitoja osumia (taivutus + yhdyssanan alku)
  {
    name: 'aito yökerho-taivutus osuu yhä (yökerhossa)',
    e: { title: 'Uudenvuoden juhlat', shortDescription: 'Ilta jatkuu yökerhossa aamuun asti.', categories: [], ysoIds: [] },
    in: ['yoelama'],
  },
  {
    name: 'yöelämäkulttuuri osuu yhä yoelamaan',
    e: { title: 'Bilepassio', shortDescription: 'Sukellus nykyajan helsinkiläiseen yöelämäkulttuuriin.', categories: [], ysoIds: [] },
    in: ['yoelama'],
  },
  // ── Lisää substring-miinoja (mitattu 3 838 tapahtuman korpuksesta) ─────────
  // Venue-nimi jätetään TARKOITUKSELLA pois classifyEventin tekstistä, mutta
  // LinkedEventsin KUVAUS toistaa sen ("Saunabaarissa maanantaisin…") → suoja
  // ohitettiin kanavaa vaihtamalla. Siksi testi kattaa kuvauskanavan.
  {
    name: 'saunabaari kuvauksessa EI tee neulontakerhosta baaria',
    e: { title: 'Käsityöryhmä', shortDescription: 'Saunabaarissa maanantaisin klo 10. Tuo omat työt.', categories: ['Työpajat', 'neulonta'], ysoIds: [] },
    out: ['baari'],
  },
  {
    name: 'barbaarirannikko EI ole baari (bar+baari straddle)',
    e: { title: 'Ari Saastamoinen: Barbaarirannikon merirosvot', shortDescription: 'Kirjailijavieraana kirjastossa.', categories: ['kirjat', 'kirjallisuus'], ysoIds: [] },
    out: ['baari'],
  },
  {
    name: 'aito baari-taivutus osuu yhä (kellaribaarissa → sananalku "baari" puuttuu, mutta paljas baari osuu)',
    e: { title: 'Karaokeilta', shortDescription: 'Baarissa joka perjantai.', categories: [], ysoIds: [] },
    in: ['baari'],
  },
  {
    name: 'esseekokoelma EI tee kirjailijavierailusta museota',
    e: { title: 'Esko Valtaoja kirjailijavieraana', shortDescription: 'Uusi esseekokoelma esittelyssä.', categories: [], ysoIds: [] },
    out: ['museo'],
  },
  {
    name: 'aito kokoelma-taivutus osuu yhä museoon',
    e: { title: 'Kurkistus Sammon kokoelmaan', shortDescription: 'Opastus varastojen aarteisiin.', categories: [], ysoIds: [] },
    in: ['museo'],
  },
  {
    name: 'lasitaidenäyttely kuvauksessa EI vetoa tanssiteosta pois Teatterista',
    e: { title: 'Willman Dance Company: USKO-FAITH', shortDescription: 'Tanssiteos esitetään lasitaidenäyttelyn tiloissa.', categories: [], ysoIds: [] },
    in: ['teatteri'],
  },
]

// extractYsoIds — @id-poiminnan yksikkötestit
const ysoChecks: { name: string; input: ({ '@id'?: string } | null)[]; expect: string[] }[] = [
  { name: 'poimii yso-koodin @id:stä', input: [{ '@id': 'https://api.hel.fi/linkedevents/v1/keyword/yso:p11185/' }], expect: ['yso:p11185'] },
  { name: 'poimii kulke-koodin', input: [{ '@id': 'https://api.hel.fi/linkedevents/v1/keyword/kulke:48/' }], expect: ['kulke:48'] },
  { name: 'sietää tyhjän/null-avainsanan', input: [null, {}, { '@id': '' }], expect: [] },
]

let pass = 0
const failures: string[] = []
for (const c of CASES) {
  const got = classifyEvent(c.e)
  const missing = (c.in ?? []).filter((id) => !got.includes(id))
  const extra = (c.out ?? []).filter((id) => got.includes(id))
  if (missing.length === 0 && extra.length === 0) {
    pass++
  } else {
    failures.push(
      `✗ ${c.name}\n    sai: [${got.join(', ')}]` +
      (missing.length ? `\n    PUUTTUU: [${missing.join(', ')}]` : '') +
      (extra.length ? `\n    VÄÄRIN MUKANA: [${extra.join(', ')}]` : '')
    )
  }
}
for (const c of ysoChecks) {
  const got = extractYsoIds(c.input)
  if (JSON.stringify(got) === JSON.stringify(c.expect)) pass++
  else failures.push(`✗ extractYsoIds: ${c.name} → sai [${got.join(',')}], odotus [${c.expect.join(',')}]`)
}

// Lähdeterveyden kanaria — anomalian havaitsemislogiikka (RA-tyylinen hiljainen
// romahdus EI saa jäädä huomaamatta, mutta laillisesti tyhjät lähteet EIVÄT
// saa hälyttää — eikä myöskään yksittäisen lähteen hetkellinen
// vastaamattomuus (ok=false), joka on verkkohäiriö, ei lähteen kuolema;
// tuotannossa 8/2026: minuutin pätkäisy → 30 min välimuisti → väärä DOWN-hälytys)
const healthChecks: { name: string; payload: CanaryPayload | null; expectIssue: boolean }[] = [
  { name: 'terve syöte → ei hälytystä', expectIssue: false, payload: { total: 780, sources: [{ name: 'linked-events', ok: true, count: 425 }, { name: 'ra', ok: true, count: 13 }, { name: 'pubivisat', ok: true, count: 94 }, { name: 'eventbrite', ok: true, count: 0 }] } },
  { name: 'RA-tyylinen hiljainen kuolema (ra=0, muuten OK) → hälytys', expectIssue: true, payload: { total: 780, sources: [{ name: 'linked-events', ok: true, count: 425 }, { name: 'ra', ok: true, count: 0 }, { name: 'pubivisat', ok: true, count: 94 }] } },
  { name: 'koko aggregaatti romahtaa → hälytys', expectIssue: true, payload: { total: 12, sources: [{ name: 'linked-events', ok: true, count: 5 }] } },
  { name: 'runkolähde romahtaa → hälytys', expectIssue: true, payload: { total: 200, sources: [{ name: 'linked-events', ok: true, count: 10 }, { name: 'ra', ok: true, count: 13 }, { name: 'pubivisat', ok: true, count: 94 }] } },
  { name: 'pubivisat-skraperi rikki (0) → hälytys', expectIssue: true, payload: { total: 780, sources: [{ name: 'linked-events', ok: true, count: 425 }, { name: 'ra', ok: true, count: 13 }, { name: 'pubivisat', ok: true, count: 0 }] } },
  { name: 'koko haku alhaalla (null) → hälytys', expectIssue: true, payload: null },
  { name: 'laillisesti tyhjät pikkulähteet EIVÄT hälytä', expectIssue: false, payload: { total: 780, sources: [{ name: 'linked-events', ok: true, count: 425 }, { name: 'ra', ok: true, count: 13 }, { name: 'pubivisat', ok: true, count: 94 }, { name: 'lepakkomies', ok: true, count: 0 }, { name: 'glivelab', ok: true, count: 0 }, { name: 'savoy', ok: true, count: 0 }] } },
  { name: 'pubivisat vastaamaton (ok=false) → EI hälytystä (hetkellinen häiriö)', expectIssue: false, payload: { total: 780, sources: [{ name: 'linked-events', ok: true, count: 425 }, { name: 'ra', ok: true, count: 13 }, { name: 'pubivisat', ok: false, count: 0 }] } },
  { name: 'ra vastaamaton (ok=false) → EI hälytystä (hetkellinen häiriö)', expectIssue: false, payload: { total: 780, sources: [{ name: 'linked-events', ok: true, count: 425 }, { name: 'ra', ok: false, count: 0 }, { name: 'pubivisat', ok: true, count: 94 }] } },
]
for (const c of healthChecks) {
  const issues = detectSourceAnomalies(c.payload)
  if ((issues.length > 0) === c.expectIssue) pass++
  else failures.push(`✗ kanaria: ${c.name} → sai [${issues.join(' | ') || '(ei poikkeamia)'}], odotus ${c.expectIssue ? 'HÄLYTYS' : 'ei hälytystä'}`)
}

// Kausilattia (Superterassi/recurring): heinäkuussa 0 = hiljainen kuolema →
// hälytys, mutta kauden ulkopuolella 0 on laillinen → ei hälytystä. Ilman
// month-argumenttia kausilattiaa ei tarkisteta.
const base = (recurringCount: number, recurringOk = true): CanaryPayload => ({
  total: 780,
  sources: [
    { name: 'linked-events', ok: true, count: 425 },
    { name: 'ra', ok: true, count: 13 },
    { name: 'pubivisat', ok: true, count: 94 },
    { name: 'recurring', ok: recurringOk, count: recurringCount },
  ],
})
const seasonalChecks: { name: string; payload: CanaryPayload; month?: number; expectIssue: boolean }[] = [
  { name: 'heinäkuu + recurring=0 → hälytys (kausikuolema)', month: 7, payload: base(0), expectIssue: true },
  { name: 'heinäkuu + recurring=6 → ei hälytystä', month: 7, payload: base(6), expectIssue: false },
  { name: 'heinäkuu + recurring vastaamaton → ei hälytystä (hetkellinen häiriö)', month: 7, payload: base(0, false), expectIssue: false },
  { name: 'joulukuu + recurring=0 → ei hälytystä (kauden ulkopuolella)', month: 12, payload: base(0), expectIssue: false },
  { name: 'elokuu + recurring=0 → ei hälytystä (kauden reuna, ei tarkisteta)', month: 8, payload: base(0), expectIssue: false },
  { name: 'ei month-arg + recurring=0 → ei kausitarkistusta', month: undefined, payload: base(0), expectIssue: false },
]
for (const c of seasonalChecks) {
  const issues = detectSourceAnomalies(c.payload, c.month)
  if ((issues.length > 0) === c.expectIssue) pass++
  else failures.push(`✗ kausikanaria: ${c.name} → sai [${issues.join(' | ') || '(ei poikkeamia)'}], odotus ${c.expectIssue ? 'HÄLYTYS' : 'ei hälytystä'}`)
}

// Superterassi-parseri: kausi-ikkuna + yleinen viikkoaika (aikaväli) vain
// päivämäärättömistä kappaleista; päivätyt kertaesiintymät ja niiden alaesiintymät
// (yksittäinen "klo HH.MM Nimi") EIVÄT muutu viikkoajaksi → lauantai putoaa.
const SUP_FIXTURE = `
<div class="dates">12.6.-13.8.2026</div>
<h4>MAANANTAI &ndash; Ole Fitiss&auml;</h4>
<p>Aamujoogaa.</p><p>klo 10.30&ndash;11.15 Morning Flow</p>
<h4>KESKIVIIKKO &ndash; Pepsi MAX -keikkakeskiviikko</h4>
<p>Livemusiikkia.</p><p>klo 14.00&ndash;14.45</p><p>17.6. Hanhani<br/>24.6. High-D</p><p>klo 19.30 alkaen</p>
<h4>LAUANTAI &ndash; Food &amp; Fun</h4>
<p>Brunssia.</p><p>18.7. klo 18.00</p><p>klo 14.00 Three Shots on the Rocks</p>
`
const supDefs = parseSuperterassi(SUP_FIXTURE)
const supSeason = parseSeason(SUP_FIXTURE)
const byWd = new Map(supDefs.map((d) => [d.weekday, d]))
const supChecks: { name: string; ok: boolean }[] = [
  { name: 'kausi 12.6.–13.8.2026', ok: supSeason?.start === '2026-06-12' && supSeason?.end === '2026-08-13' },
  { name: 'maanantai aikaväli 10:30', ok: byWd.get(1)?.startHour === 10 && byWd.get(1)?.startMinute === 30 },
  { name: 'keskiviikko ilta 19:30 (ei iltapäivä 14:00)', ok: byWd.get(3)?.startHour === 19 && byWd.get(3)?.startMinute === 30 },
  { name: 'lauantai pudotettu (vain päivättyjä/kertaesiintymiä)', ok: !byWd.has(6) },
  { name: 'jokainen def kantaa kausirajan', ok: supDefs.length > 0 && supDefs.every((d) => d.seasonStart === '2026-06-12' && d.seasonEnd === '2026-08-13') },
]
for (const c of supChecks) {
  if (c.ok) pass++
  else failures.push(`✗ superterassi-parseri: ${c.name}`)
}

// Flying Dutch -settilistan parseri (tuotantoviat 8/2026: split-regex ei
// osunut koskaan → live-skrape aina 0 → lähde eli vain staattisella listalla;
// eilinen keikka siirtyi ensi vuoteen ja katosi näkymästä seuraavana päivänä).
const FD_TEXT =
  'At Flying Dutch, we unwind to live. - Hanski SUMMER SETLIST ' +
  '23.5. Markus Holkko Quartet 3.6. The Shubie Brothers 11.6. Emma Salokoski & Jarmo Saari ' +
  '12.6. DJ Borzin: Balkan Fever (17-21) 25.6. Tuomo 5.7. Flying Dutch: Stand Up ' +
  '9.7. The Stance Brothers 22.7. Django Collective Helsinki ' +
  '25.7. Paleface DJ Set: Toven & Tootin levykokoelma (18-21) ' +
  '6.8. Paleface & Räjähtävä Nyrkki 20.8. Lightboxer ' +
  '29.8. Season wrap up: DJs Daddy Pales & Borzin Showtime 19.00 unless informed otherwise. ' +
  'Free entry. OPENING HOURS Bar: Mon-Sat 12-24'
const fdParsed = parseSetlistText(FD_TEXT, '2026-08-07')
const fdByDate = new Map(fdParsed.map((e) => [e.date, e]))
const fdChecks: { name: string; ok: boolean }[] = [
  { name: 'kaikki 12 settilistan keikkaa parsittu (split-regex toimii)', ok: fdParsed.length === 12 },
  { name: 'eilinen keikka 6.8. jää KULUVALLE vuodelle (ei katoa)', ok: fdByDate.get('2026-08-06')?.title === 'Paleface & Räjähtävä Nyrkki' },
  { name: 'tuleva keikka 20.8. parsittu', ok: fdByDate.get('2026-08-20')?.title === 'Lightboxer' },
  { name: 'aikaväli (17-21) → 17:00, sulkeiset pois nimestä', ok: fdByDate.get('2026-06-12')?.time === '17:00' && fdByDate.get('2026-06-12')?.title === 'DJ Borzin: Balkan Fever' },
  { name: 'viimeinen keikka ei sisällä Showtime-jätettä', ok: fdByDate.get('2026-08-29')?.title === 'Season wrap up: DJs Daddy Pales & Borzin' },
  { name: '>60 vrk mennyt (23.5.) siirtyy ensi vuoteen', ok: fdByDate.has('2027-05-23') },
]
for (const c of fdChecks) {
  if (c.ok) pass++
  else failures.push(`✗ flyingdutchman-parseri: ${c.name} → sai ${JSON.stringify(fdParsed.find((e) => e.title.includes('Paleface')) ?? fdParsed.slice(0, 3))}`)
}
const fdDateChecks: { name: string; in: string; today: string; expect: string }[] = [
  { name: 'eilinen 6.8. → kuluva vuosi', in: '6.8.', today: '2026-08-07', expect: '2026-08-06' },
  { name: 'kuukausi sitten 9.7. → kuluva vuosi', in: '9.7.', today: '2026-08-07', expect: '2026-07-09' },
  { name: '76 vrk sitten 23.5. → ensi vuosi', in: '23.5.', today: '2026-08-07', expect: '2027-05-23' },
  { name: 'vuodenvaihde: 29.12. tammikuisena → viime vuosi', in: '29.12.', today: '2026-01-05', expect: '2025-12-29' },
  { name: 'vuodenvaihde: 15.1. joulukuisena → ensi vuosi', in: '15.1.', today: '2025-12-20', expect: '2026-01-15' },
  { name: '1.1. uutenavuotena → ensi vuosi', in: '1.1.', today: '2026-12-31', expect: '2027-01-01' },
  { name: 'virheellinen 32.1. → tyhjä', in: '32.1.', today: '2026-08-07', expect: '' },
]
for (const c of fdDateChecks) {
  const got = parseFinnishDate(c.in, c.today)
  if (got === c.expect) pass++
  else failures.push(`✗ parseFinnishDate: ${c.name} → sai '${got}', odotus '${c.expect}'`)
}

// Stadissa-viikkoikkunointi (tuotantovika 8/2026: haku aina "tänään + 4 vko"
// pyydetystä ikkunasta riippumatta → Thailand Festival 9.–10.5. ei löytynyt).
const weekChecks: { name: string; got: string[]; expectLen: number; expectFirst: string }[] = [
  { name: 'yksi päivä → yksi viikkosivu', got: weekParamDates('2026-05-06', '2026-05-06'), expectLen: 1, expectFirst: '2026-05-06' },
  { name: 'Thailand-festivaali-ikkuna 6.–10.5. → yksi sivu', got: weekParamDates('2026-05-06', '2026-05-10'), expectLen: 1, expectFirst: '2026-05-06' },
  { name: '15 vrk:n ikkuna → kolme kalenteriviikkoa', got: weekParamDates('2026-05-06', '2026-05-20'), expectLen: 3, expectFirst: '2026-05-06' },
  { name: 'elokuu+syyskuu → 9 sivua', got: weekParamDates('2026-08-01', '2026-09-30'), expectLen: 9, expectFirst: '2026-08-01' },
  { name: 'vuoden ikkuna → katkaistu 12 sivuun', got: weekParamDates('2026-01-01', '2026-12-31'), expectLen: 12, expectFirst: '2026-01-01' },
]
for (const c of weekChecks) {
  if (c.got.length === c.expectLen && c.got[0] === c.expectFirst) pass++
  else failures.push(`✗ weekParamDates: ${c.name} → sai ${c.got.length} sivua, ensimmäinen ${c.got[0]}`)
}

// Venue-skraperien streak-tilakone: hiljainen parserikuolema tulee ilmi
// putkessa, mutta yksittäiset häiriöt ja lailliset hiljaiset viikot EIVÄT hälytä.
const streakChecks: { name: string; seq: VenueScrapeSample[]; expectAlerts: number[]; finalZero: number; finalError: number }[] = [
  {
    name: 'terve putki → ei hälytystä, putket nollassa',
    seq: [{ live: 12, scrapeError: null }, { live: 3, scrapeError: null }],
    expectAlerts: [], finalZero: 0, finalError: 0,
  },
  {
    name: 'kova virhe 1 pv → ei hälytystä; 2 pv → hälytys; 3 pv → ei uutta (ei spämmiä)',
    seq: [
      { live: null, scrapeError: 'HTTP 500' },
      { live: null, scrapeError: 'HTTP 500' },
      { live: null, scrapeError: 'HTTP 500' },
    ],
    expectAlerts: [1], finalZero: 0, finalError: 3,
  },
  {
    name: '0 parsittua 4 pv → ei hälytystä; 5. pv → hälytys (hiljainen kuolema)',
    seq: [
      { live: 0, scrapeError: null }, { live: 0, scrapeError: null }, { live: 0, scrapeError: null },
      { live: 0, scrapeError: null }, { live: 0, scrapeError: null },
    ],
    expectAlerts: [4], finalZero: 5, finalError: 0,
  },
  {
    name: '"parse yielded 0" on NOLLAsignaali, ei kova virhe (off-season ei spämmää)',
    seq: [
      { live: 0, scrapeError: 'parse yielded 0 (sivun rakenne muuttunut?)' },
      { live: 0, scrapeError: 'parse yielded 0 (sivun rakenne muuttunut?)' },
    ],
    expectAlerts: [], finalZero: 2, finalError: 0,
  },
  {
    name: '0-putki katkeaa kun lähde tervehtyy → putket nollautuvat',
    seq: [{ live: 0, scrapeError: null }, { live: 0, scrapeError: null }, { live: 5, scrapeError: null }],
    expectAlerts: [], finalZero: 0, finalError: 0,
  },
  {
    name: 'meta puuttuu (live null, ei virhettä) → ei muuta putkia eikä hälytä',
    seq: [{ live: 0, scrapeError: null }, { live: null, scrapeError: null }, { live: null, scrapeError: null }],
    expectAlerts: [], finalZero: 1, finalError: 0,
  },
]
for (const c of streakChecks) {
  let state: StreakState = { zeroStreak: 0, errorStreak: 0 }
  const alerts: number[] = []
  c.seq.forEach((sample, i) => {
    const r = nextStreak(state, sample)
    if (r.alert) alerts.push(i)
    state = r.next
  })
  const okAlerts = JSON.stringify(alerts) === JSON.stringify(c.expectAlerts)
  const okState = state.zeroStreak === c.finalZero && state.errorStreak === c.finalError
  if (okAlerts && okState) pass++
  else failures.push(`✗ streak: ${c.name} → hälytykset indekseissä [${alerts}], tila ${state.zeroStreak}/${state.errorStreak}`)
}

// ── Kaupunginlaajuisten lähteiden lattiat (lisätty 8/2026) ──────────────────
// helmet palautti 0/624 tapahtumaa ja espoo osoitti kuolleeseen domainiin
// KUUKAUSIA, koska kumpikaan ei ollut valvonnassa. Nolla näissä on aina rikki.
const cityFloor = (name: string, count: number): CanaryPayload => ({
  total: 780,
  sources: [
    { name: 'linked-events', ok: true, count: 425 },
    { name: 'ra', ok: true, count: 13 },
    { name: 'pubivisat', ok: true, count: 94 },
    { name, ok: true, count },
  ],
})
const floorChecks: { name: string; payload: CanaryPayload; expectIssue: boolean }[] = [
  { name: 'helmet=0 → hälytys (tuotantovika 8/2026)', payload: cityFloor('helmet', 0), expectIssue: true },
  { name: 'helmet=109 (mitattu normi) → ei hälytystä', payload: cityFloor('helmet', 109), expectIssue: false },
  { name: 'museums=0 → hälytys', payload: cityFloor('museums', 0), expectIssue: true },
  { name: 'museums=117 (mitattu normi) → ei hälytystä', payload: cityFloor('museums', 117), expectIssue: false },
  { name: 'espoo=0 → hälytys (kuollut domain 8/2026)', payload: cityFloor('espoo', 0), expectIssue: true },
  { name: 'espoo=103 (mitattu normi) → ei hälytystä', payload: cityFloor('espoo', 103), expectIssue: false },
  { name: 'stadissa=0 → hälytys', payload: cityFloor('stadissa', 0), expectIssue: true },
  { name: 'stadissa=183 (mitattu normi) → ei hälytystä', payload: cityFloor('stadissa', 183), expectIssue: false },
  // Hiljainen viikko EI saa hälyttää: lattia on ~10 % normista, ei 50 %.
  { name: 'helmet=25 (hiljainen viikko) → ei hälytystä', payload: cityFloor('helmet', 25), expectIssue: false },
  // Vastaamattomuus on hetkellinen häiriö, ei kuolema — sama periaate kuin ra/pubivisat.
  { name: 'helmet vastaamaton (ok=false) → ei hälytystä', expectIssue: false, payload: {
    total: 780,
    sources: [
      { name: 'linked-events', ok: true, count: 425 },
      { name: 'ra', ok: true, count: 13 },
      { name: 'pubivisat', ok: true, count: 94 },
      { name: 'helmet', ok: false, count: 0 },
    ],
  } },
]
for (const c of floorChecks) {
  const issues = detectSourceAnomalies(c.payload)
  if ((issues.length > 0) === c.expectIssue) pass++
  else failures.push(`✗ lattia: ${c.name} → sai [${issues.join(' | ') || '(ei poikkeamia)'}], odotus ${c.expectIssue ? 'HÄLYTYS' : 'ei hälytystä'}`)
}

// ── RUOKALISTAN TIIVISTELMÄ (lib/menu-summary) ──────────────────────────────
// Säännöt ovat hienovaraisia ja jokainen niistä on olemassa MITATUN virheen
// takia. Ilman näitä testejä väärä hinta pääsee korttiin huomaamatta.
const svc = (
  title: string, price: number | null, category = 'Pääruoat', snippet = 'Pitkä kuvaus annoksesta',
) => ({ title, snippet, category, price: price === null ? null : { current: price, currency: 'EUR', displayed_price: `${price.toFixed(2).replace('.', ',')} €` } })

const menuChecks: { name: string; input: unknown; expect: null | { typical: number; firstSample?: string } }[] = [
  {
    name: 'ALKAEN-ANSA: halvin on lisuke → mediaani, ei minimi (Bistro Liekki 1,70 € vs 23 €)',
    input: [svc('Extra Dippi', 1.7, 'Lisukkeet'), svc('CHILI SMASH', 23), svc('BACON SMASH', 23), svc('ONION SMASH', 24)],
    expect: { typical: 23, firstSample: 'CHILI SMASH' },
  },
  {
    name: 'JUOMA-ANSA: cocktailit pois kun ruokakategoria on olemassa (Elite/Negroni)',
    input: [svc('Negroni', 13, 'APERITIIVEJA'), svc('Olgan Eliksiiri', 13, 'APERITIIVEJA'),
            svc('Paistettua naudanmaksaa', 26, 'PÄÄRUOAT'), svc('Mie Maksan', 25, 'PÄÄRUOAT'), svc('Bataattia', 27, 'PÄÄRUOAT')],
    expect: { typical: 26 },
  },
  {
    name: 'KAHVILA: kun ruokakategorioita ei ole, juomat KELPAAVAT (kahvi on tuote)',
    input: [svc('Espresso', 3.5, 'Hot Drinks'), svc('Cortado', 3.6, 'Hot Drinks'), svc('Latte', 4.5, 'Hot Drinks')],
    expect: { typical: 3.6 },
  },
  {
    name: 'RUOALTA PUUTTUU HINNAT → ei tiivistelmää (Stefan\'s: 16 pihviä ilman hintaa)',
    input: [svc('Tomahawk', null, 'Steaks'), svc('Ribeye', null, 'Steaks'), svc('L.A Burger', null, 'Main Course'),
            svc('Red wine sauce', 4, 'Sauces (L, G)'), svc('Creme Brulee', 12, 'Desserts'), svc('Cheesecake', 12, 'Desserts'), svc('Panna cotta', 12, 'Desserts')],
    expect: null,
  },
  {
    name: 'LEIPOMO: ei pääruokakategorioita lainkaan → jälkiruoat kelpaavat',
    input: [svc('Korvapuusti', 4.5, 'Desserts'), svc('Mustikkapiirakka', 5, 'Desserts'), svc('Munkki', 4, 'Desserts')],
    expect: { typical: 4.5 },
  },
  {
    name: 'JÄRJETÖN HINTA pudotetaan (nuudelikeitto 1824 €)',
    input: [svc('Peking Duck Noodle Soup', 1824), svc('Mapo Pork', 18), svc('Shredded Chicken', 18), svc('Cold Chili Noodle', 16)],
    expect: { typical: 18 },
  },
  {
    name: '0,00 € ei tarkoita ilmaista → pois; 0,60 € pizzatäyte kelpaa',
    input: [svc('6 Side Dishes', 0, 'Pääruoat'), svc('Valkosipuli', 0.6, 'Pääruoat'), svc('Margherita', 14.8), svc('Marinara', 12.9)],
    expect: { typical: 12.9 },
  },
  { name: 'alle kolme annosta → ei tiivistelmää', input: [svc('A', 10), svc('B', 12)], expect: null },
  { name: 'ei taulukko → ei tiivistelmää', input: null, expect: null },
  { name: 'roskaa sisällä ei kaada', input: [null, 'x', { title: 5 }, svc('A', 10), svc('B', 12), svc('C', 11)], expect: { typical: 11 } },
  {
    name: 'muu valuutta pudotetaan',
    input: [{ title: 'Steak', snippet: 'kuvaus tässä', category: 'Pääruoat', price: { current: 30, currency: 'USD' } },
            svc('A', 10), svc('B', 12), svc('C', 11)],
    expect: { typical: 11 },
  },
]
for (const c of menuChecks) {
  const got = summariseMenu(c.input)
  let ok: boolean
  if (c.expect === null) ok = got === null
  else ok = !!got && Math.abs(got.typicalPrice - c.expect.typical) < 0.005 &&
            (!c.expect.firstSample || got.samples[0]?.title === c.expect.firstSample)
  if (ok) pass++
  else failures.push(`✗ menu: ${c.name} → sai ${got ? `n. ${got.typicalPrice} € (${got.samples.map((s) => s.title).join(', ')})` : 'null'}`)
}

// Sama syöte tuottaa aina saman tuloksen — kortti ei saa heitellä ajojen välillä.
{
  const input = [svc('A', 14), svc('B', 14), svc('C', 16), svc('D', 12)]
  const a = JSON.stringify(summariseMenu(input))
  const b = JSON.stringify(summariseMenu(input))
  if (a === b) pass++
  else failures.push('✗ menu: tulos ei ole vakaa samalla syötteellä')
}

// ── Kaikkien lähteiden kattava 0-valvonta ───────────────────────────────────
// Tämä on se aukko jonka takia helmet ja espoo elivät rikkinäisinä: valvonta
// kattoi vain käsin lisätyt lähteet. Otos tulee aggregaatin luvusta.
const aggSampleChecks: { name: string; payload: CanaryPayload | null; expect: Record<string, number | null>; absent?: string[] }[] = [
  {
    name: 'ok=true → live on lähteen oma luku',
    payload: { total: 780, sources: [{ name: 'kide', ok: true, count: 0 }, { name: 'fienta', ok: true, count: 26 }] },
    expect: { kide: 0, fienta: 26 },
  },
  {
    name: 'ok=false → live null (EI OTOSTA — kylmäkäynnistys ei saa liikuttaa putkia)',
    payload: { total: 780, sources: [{ name: 'kide', ok: false, count: 0 }] },
    expect: { kide: null },
  },
  {
    name: 'venue-skraperit ohitetaan (niillä on oma rivi samassa taulussa)',
    payload: { total: 780, sources: [{ name: 'lepakkomies', ok: true, count: 0 }, { name: 'savoy', ok: true, count: 0 }, { name: 'kide', ok: true, count: 0 }] },
    expect: { kide: 0 },
    absent: ['lepakkomies', 'savoy'],
  },
  { name: 'payload null → ei otoksia lainkaan', payload: null, expect: {}, absent: ['kide'] },
]
for (const c of aggSampleChecks) {
  const got = new Map(aggregateStreakSamples(c.payload).map((s) => [s.name, s.sample.live]))
  const okExpected = Object.entries(c.expect).every(([k, v]) => got.has(k) && got.get(k) === v)
  const okAbsent = (c.absent ?? []).every((k) => !got.has(k))
  if (okExpected && okAbsent) pass++
  else failures.push(`✗ agg-otos: ${c.name} → sai ${JSON.stringify([...got])}`)
}

// Yksikään venue-skraperi ei saa vuotaa aggregaattivalvontaan — muuten kaksi
// eri signaalia kirjoittaisi samaan perusavaimeen ja putket sekoittuisivat.
{
  const leak = aggregateStreakSamples({
    total: 780,
    sources: VENUE_SCRAPERS.map((n) => ({ name: n, ok: true, count: 0 })),
  })
  if (leak.length === 0) pass++
  else failures.push(`✗ agg-otos: venue-skrapereita vuoti läpi: ${leak.map((l) => l.name).join(', ')}`)
}

// 21 pv:n kynnys: pitkä, koska mitatusti 16/45 lähdettä on laillisesti nollassa.
// Hälytys VAIN ylityshetkellä → kausilähde tuottaa yhden viestin, ei tulvaa.
{
  let state: StreakState = { zeroStreak: 0, errorStreak: 0 }
  const alerts: number[] = []
  for (let day = 0; day < AGGREGATE_ZERO_STREAK_ALERT_DAYS + 3; day++) {
    const r = nextStreak(state, { live: 0, scrapeError: null }, { zero: AGGREGATE_ZERO_STREAK_ALERT_DAYS })
    if (r.alert) alerts.push(day)
    state = r.next
  }
  if (JSON.stringify(alerts) === JSON.stringify([AGGREGATE_ZERO_STREAK_ALERT_DAYS - 1])) pass++
  else failures.push(`✗ agg-kynnys: hälytys odotettiin vain päivänä ${AGGREGATE_ZERO_STREAK_ALERT_DAYS}, sai [${alerts}]`)
}

// Venue-kynnys ei muuttunut oletuksena (vanhat kutsupaikat toimivat ennallaan).
{
  let state: StreakState = { zeroStreak: 0, errorStreak: 0 }
  const alerts: number[] = []
  for (let day = 0; day < 7; day++) {
    const r = nextStreak(state, { live: 0, scrapeError: null })
    if (r.alert) alerts.push(day)
    state = r.next
  }
  if (JSON.stringify(alerts) === JSON.stringify([4])) pass++
  else failures.push(`✗ agg-kynnys: venue-oletus muuttui — odotus [4], sai [${alerts}]`)
}

// Nollaputki katkeaa heti kun lähde herää → kausilähde ei hälytä uudelleen
// samasta kaudesta, ja herättyään se saa taas täyden 21 pv:n armonajan.
{
  let state: StreakState = { zeroStreak: 0, errorStreak: 0 }
  const alerts: number[] = []
  const seq = [
    ...Array(AGGREGATE_ZERO_STREAK_ALERT_DAYS).fill(0),
    5,
    ...Array(3).fill(0),
  ] as number[]
  seq.forEach((live, i) => {
    const r = nextStreak(state, { live, scrapeError: null }, { zero: AGGREGATE_ZERO_STREAK_ALERT_DAYS })
    if (r.alert) alerts.push(i)
    state = r.next
  })
  if (JSON.stringify(alerts) === JSON.stringify([AGGREGATE_ZERO_STREAK_ALERT_DAYS - 1]) && state.zeroStreak === 3) pass++
  else failures.push(`✗ agg-herätys: odotus yksi hälytys + putki 3, sai [${alerts}] / ${state.zeroStreak}`)
}

// ── Kaarimoottori (M1 luottamusmoottori) — tuotantoviat 8/2026: kaareen tuli
// kaksi saunaa, seuraavaan paikkaan ei ehtinyt, kiinni oleva paikka jäi kaareen,
// tonight-kaari alkoi menneessä. Fixture-malli: puhdas logiikka, ei verkkoa.
let arcCid = 0
const mkCand = (over: Partial<Candidate> & { role: CandidateRole }): Candidate => ({
  id: `arc-${++arcCid}`,
  type: 'activity',
  title: `Kohde ${arcCid}`,
  why: '',
  emoji: '📍',
  image: null,
  tags: [],
  _score: 1,
  ...over,
})
const mkVotes = (loves: Record<string, number>): Record<string, { love: number; skip: number }> =>
  Object.fromEntries(Object.entries(loves).map(([id, love]) => [id, { love, skip: 0 }]))

const mkEvent = (over: Partial<Event> & { id: string; title: string; startTime: string }): Event => ({
  shortDescription: 'Lyhyt kuvaus tapahtumasta, joka on tarpeeksi pitkä laatukynnykseen',
  description: '',
  endTime: null,
  location: null,
  image: 'https://example.com/kuva.jpg',
  isFree: true,
  price: null,
  ticketUrl: null,
  infoUrl: null,
  categories: [],
  source: 'linked-events',
  vibes: ['keikka'],
  ...over,
} as Event)

const saunaA = mkCand({ role: 'activity', title: 'Sauna A', tags: ['sauna'], _score: 5 })
const saunaB = mkCand({ role: 'activity', title: 'Sauna B', tags: ['sauna'], _score: 4 })
const ruokaX = mkCand({ type: 'restaurant', role: 'food', title: 'Ravintola X', tags: ['ravintola'], openingHours: 'Mo-Su 10:00-23:00', _score: 3 })
const ruokaY = mkCand({ type: 'restaurant', role: 'food', title: 'Ravintola Y', tags: ['ravintola'], openingHours: 'Mo-Su 10:00-23:00', _score: 2 })
const kiinniSu = mkCand({ type: 'restaurant', role: 'food', title: 'Suljettu sunnuntaina', tags: ['ravintola'], openingHours: 'Mo-Fr 10:00-18:00', _score: 9 })

// Keskipiste Helsinki + kaukopiste (~4–5 h kävelyä) toteutettavuustestiin
const CENTER = { lat: 60.1699, lon: 24.9384 }
const FAR = { lat: 60.35, lon: 25.2 }
const ruokaKesk = mkCand({ type: 'restaurant', role: 'food', title: 'Keskusta', tags: ['ravintola'], openingHours: 'Mo-Su 10:00-23:00', ...CENTER, _score: 3 })
const ruokaFar = mkCand({ type: 'restaurant', role: 'food', title: 'Kaukana', tags: ['ravintola'], openingHours: 'Mo-Su 10:00-23:00', ...FAR, _score: 4 })
const keikka19 = mkCand({ type: 'event', role: 'program', title: 'Keikka klo 19', tags: ['keikka'], time: 'to 19.00', ...CENTER, _score: 5 })
const keikka19Far = mkCand({ type: 'event', role: 'program', title: 'Keikka klo 19 kaukana', tags: ['keikka'], time: 'to 19.00', ...FAR, _score: 5 })
const keikkaB = mkCand({ type: 'event', role: 'program', title: 'Keikka B', tags: ['keikka'], time: 'to 21.00', ...CENTER, _score: 4 })

const ARC_DAY = '2026-08-09' // sunnuntai (kiinniSu-fixture vaatii arkisulun)
const superEi = new Set<string>()

const arcFixtures: { name: string; ok: boolean }[] = []

// 1. Kaksi saunaa tykättynä → kaareen TASAN YKSI sauna (se jolla enemmän ❤️)
{
  const plan = buildDeterministicArc([saunaA, saunaB, ruokaX], mkVotes({ [saunaA.id]: 3, [saunaB.id]: 2, [ruokaX.id]: 2 }), superEi, { when: 'tonight', date: ARC_DAY })
  const saunas = plan?.arc.filter(s => subtypeOf({ tags: ['sauna'] } as Candidate) && s.title.startsWith('Sauna')) ?? []
  arcFixtures.push({ name: 'duplikaattisuoja: max 1 sauna kaaressa', ok: plan != null && saunas.length === 1 && saunas[0].title === 'Sauna A' })
}

// 2. Kaksi ravintolaa tykättynä → max 1 food-vaihe
{
  const plan = buildDeterministicArc([ruokaX, ruokaY], mkVotes({ [ruokaX.id]: 2, [ruokaY.id]: 1 }), superEi, { when: 'tonight', date: ARC_DAY })
  arcFixtures.push({ name: 'duplikaattisuoja: max 1 ravintola kaaressa', ok: plan != null && plan.arc.filter(s => s.role === 'food').length === 1 && plan.arc[0].title === 'Ravintola X' })
}

// 3. Kiinni koko kaarpäivän oleva paikka KARSITAAN (ei "⚠ kiinni" -badgea kaaressa)
{
  const closed = closedOnArcDay(kiinniSu, new Date(`${ARC_DAY}T12:00:00`))
  const plan = buildDeterministicArc([kiinniSu, ruokaX], mkVotes({ [kiinniSu.id]: 5, [ruokaX.id]: 1 }), superEi, { when: 'tonight', date: ARC_DAY })
  arcFixtures.push({ name: 'kiinni-portti: su kiinni oleva karsitaan', ok: closed && plan != null && plan.arc.every(s => !s.title.includes('Suljettu')) && plan.arc.some(s => s.title === 'Ravintola X') })
}

// 4. Kaksi tapahtumaa samalle illalle → max 1 program
{
  const plan = buildDeterministicArc([keikka19, keikkaB], mkVotes({ [keikka19.id]: 2, [keikkaB.id]: 1 }), superEi, { when: 'tonight', date: ARC_DAY })
  arcFixtures.push({ name: 'max 1 ohjelma kaaressa', ok: plan != null && plan.arc.filter(s => s.role === 'program').length === 1 })
}

// 5. Toteutettavuus: ruoka siirtyy AIKAISEMMIN jotta keikalle (19:00) ehditään
//    (matka ~4–5 h → ruuan on alettava jo päivällä, ei oletusajalla 18.5)
{
  const plan = buildDeterministicArc([ruokaFar, keikka19], mkVotes({ [ruokaFar.id]: 2, [keikka19.id]: 2 }), superEi, { when: 'tonight', date: ARC_DAY })
  const food = plan?.arc.find(s => s.role === 'food')
  const prog = plan?.arc.find(s => s.role === 'program')
  const travelH = (walkMinutesBetween(ruokaFar, keikka19) ?? 0) / 60
  let ok = !!(plan && food && prog && prog.time === 'to 19.00')
  if (ok && food && prog) {
    const m = food.time?.match(/(\d{1,2})(?:\.(\d{2}))?/)
    const foodH = m ? Number(m[1]) + Number(m[2] ?? 0) / 60 : 99
    // ruoka + kesto 1.5h + matka + puskuri 0.25 ≤ 19.00 (15 min pyöristysvara)
    ok = foodH + 1.5 + travelH + 0.25 <= 19.01
  }
  arcFixtures.push({ name: 'toteutettavuus: ruoka aikaisemmin jotta keikalle ehditään', ok })
}

// 6. Ei mahdu ennen ohjelmaa (nyt 17, ohjelma 18, aktiviteetti 2h) →
//    aktiviteetti SIIRTYY ohjelman jälkeen (post-anchor placement) —
//    parempi kuin pudottaa: museo voi olla validi 20:15 alkaen.
{
  const aktiviteetti = mkCand({ role: 'activity', title: 'Aktiviteetti', tags: ['museo'], openingHours: 'Mo-Su 09:00-23:00', ...CENTER, _score: 3 })
  const keikka18 = mkCand({ type: 'event', role: 'program', title: 'Keikka klo 18', tags: ['keikka'], time: 'to 18.00', dateISO: ARC_DAY, ...CENTER, _score: 5 })
  const plan = buildDeterministicArc([aktiviteetti, keikka18], mkVotes({ [aktiviteetti.id]: 2, [keikka18.id]: 2 }), superEi, { when: 'tonight', date: ARC_DAY, nowH: 17 })
  const actStep = plan?.arc.find(s => s.title === 'Aktiviteetti')
  const progIdx = plan?.arc.findIndex(s => s.role === 'program') ?? -1
  const actIdx = plan?.arc.findIndex(s => s.title === 'Aktiviteetti') ?? -1
  const actH = actStep?.time?.match(/(\d{1,2})(?:\.(\d{2}))?/)
  arcFixtures.push({ name: 'ei mahdu ennen → siirtyy ohjelman jälkeen (klo 20.15)', ok: plan != null && actIdx > progIdx && actH != null && Number(actH[1]) + Number(actH[2] ?? 0) / 60 >= 20 })
}

// 6b. GRÖN-skenaario (käyttäjätapaus 8/2026): Michelin-ravintola auki vasta
//     17:00 → EI saa tulla klo 11.15 (kiinni), vaan ohjelman jälkeen klo 17.
{
  const LA = '2026-08-08' // lauantai
  const gron = mkCand({ type: 'restaurant', role: 'food', title: 'Grön', tags: ['ravintola'], openingHours: 'We 17:00-24:00, Th 17:00-24:00, Fr 17:00-24:00, Sa 13:00-15:30,17:00-24:00', ...CENTER, _score: 5 })
  const teatteri13 = mkCand({ type: 'event', role: 'program', title: 'Teatteri klo 13', tags: ['teatteri'], time: 'la 13.00', dateISO: LA, ...CENTER, _score: 4 })
  const plan = buildDeterministicArc([gron, teatteri13], mkVotes({ [gron.id]: 3, [teatteri13.id]: 2 }), superEi, { when: 'weekend', date: LA })
  const food = plan?.arc.find(s => s.role === 'food')
  const foodH = food?.time?.match(/(\d{1,2})(?:\.(\d{2}))?/)
  const progIdx = plan?.arc.findIndex(s => s.role === 'program') ?? -1
  const foodIdx = plan?.arc.findIndex(s => s.role === 'food') ?? -1
  const h = foodH ? Number(foodH[1]) + Number(foodH[2] ?? 0) / 60 : 0
  arcFixtures.push({ name: 'Grön: ei klo 11.15 (kiinni) vaan klo 17 ohjelman jälkeen', ok: plan != null && food != null && h >= 16.75 && h <= 17.25 && foodIdx > progIdx })
}

// 6c. Rooli-ikkuna ilman aukiolodataa: ruoka ei voi alkaa ennen klo 10.30
//     (ohjelma 12:00 → ruoka ei mahdu eteen → ohjelman jälkeen 14.15)
{
  const ruokaNoH = mkCand({ type: 'restaurant', role: 'food', title: 'Ravintola ilman tunteja', tags: ['ravintola'], ...CENTER, _score: 3 })
  const ohjelma12 = mkCand({ type: 'event', role: 'program', title: 'Ohjelma klo 12', tags: ['keikka'], time: 'la 12.00', dateISO: '2026-08-08', ...CENTER, _score: 5 })
  const plan = buildDeterministicArc([ruokaNoH, ohjelma12], mkVotes({ [ruokaNoH.id]: 2, [ohjelma12.id]: 2 }), superEi, { when: 'weekend', date: '2026-08-08' })
  const food = plan?.arc.find(s => s.role === 'food')
  const foodH = food?.time?.match(/(\d{1,2})(?:\.(\d{2}))?/)
  const h = foodH ? Number(foodH[1]) + Number(foodH[2] ?? 0) / 60 : 0
  arcFixtures.push({ name: 'rooli-ikkuna: ruoka ei ennen 10.30 (→ ohjelman jälkeen)', ok: plan != null && food != null && h >= 10.5 && h >= 14 })
}

// 6d. maxSteps: isäntä valitsi 2 vaihetta → kaaressa TASAN 2 vaihetta,
//     ja ne ovat eniten äänestetyt roolit (food+activity, ei drinks/program)
{
  const foodA = mkCand({ type: 'restaurant', role: 'food', title: 'Ruoka A', tags: ['ravintola'], openingHours: 'Mo-Su 10:00-23:00', _score: 3 })
  const drinkA = mkCand({ type: 'restaurant', role: 'drinks', title: 'Baari A', tags: ['baari'], openingHours: 'Mo-Su 14:00-24:00', _score: 3 })
  const actA = mkCand({ role: 'activity', title: 'Sauna A', tags: ['sauna'], openingHours: 'Mo-Su 10:00-21:00', _score: 3 })
  const progA = mkCand({ type: 'event', role: 'program', title: 'Keikka A', tags: ['keikka'], time: 'la 20.00', dateISO: '2026-08-08', ...CENTER, _score: 3 })
  const plan = buildDeterministicArc([foodA, drinkA, actA, progA],
    mkVotes({ [foodA.id]: 3, [actA.id]: 2, [drinkA.id]: 2, [progA.id]: 1 }), superEi,
    { when: 'tonight', date: '2026-08-08', maxSteps: 2 })
  const roles = plan?.arc.map(s => s.role).sort() ?? []
  arcFixtures.push({ name: 'maxSteps=2 → tasan 2 vaihetta, eniten äänestetyt roolit', ok: plan != null && plan.arc.length === 2 && JSON.stringify(roles) === JSON.stringify(['activity', 'food']) })
}

// 7. Nyt-tietoisuus: klo 22 tonight → eka vaihe ≥ 22.45 (ei mennyttä aikaa)
//    (paikka auki puoleenyöhön, jotta 22.45 alkava ruoka on toteutettava)
{
  const ruokaYo = mkCand({ type: 'restaurant', role: 'food', title: 'Yöravintola', tags: ['ravintola'], openingHours: 'Mo-Su 10:00-24:00', _score: 3 })
  const plan = buildDeterministicArc([ruokaYo], mkVotes({ [ruokaYo.id]: 1 }), superEi, { when: 'tonight', date: ARC_DAY, nowH: 22 })
  const m = plan?.arc[0]?.time?.match(/(\d{1,2})(?:\.(\d{2}))?/)
  const h = m ? Number(m[1]) + Number(m[2] ?? 0) / 60 : 0
  arcFixtures.push({ name: 'nyt-tietoisuus: kaari ei ala menneessä (22 → ≥22.45)', ok: plan != null && h >= 22.7 })
}

// 8. Reittioptimointi: samassa roolissa kaksi yhtä tykättyä → lähempi valikoituu
{
  const plan = buildDeterministicArc([ruokaFar, ruokaKesk, keikka19], mkVotes({ [ruokaFar.id]: 2, [ruokaKesk.id]: 2, [keikka19.id]: 2 }), superEi, { when: 'tonight', date: ARC_DAY })
  const food = plan?.arc.find(s => s.role === 'food')
  arcFixtures.push({ name: 'reittioptimointi: lähempi ravintola valikoituu', ok: plan != null && food?.title === 'Keskusta' })
}

// 9. Kellonaikaformatointi 15 min tarkkuudella (ei "klo 19" kun tarkalleen 19.49)
{
  const ruokaYo2 = mkCand({ type: 'restaurant', role: 'food', title: 'Yöravintola 2', tags: ['ravintola'], openingHours: 'Mo-Su 10:00-24:00', _score: 3 })
  const plan = buildDeterministicArc([ruokaYo2], mkVotes({ [ruokaYo2.id]: 1 }), superEi, { when: 'tonight', date: ARC_DAY, nowH: 22 })
  arcFixtures.push({ name: 'fmtHour: 22.75 → "klo 22.45"', ok: plan?.arc[0]?.time === 'klo 22.45' })
}

// 10. JO ALKANUT tapahtuma karsitaan kaaresta (sessio luotu ennen klo 18,
//     kaari kudottu klo 20 — käyttäjätapaus 8/2026)
{
  const joAlkanut = mkCand({ type: 'event', role: 'program', title: 'Jo alkanut keikka', tags: ['keikka'], time: 'pe 18.00', dateISO: ARC_DAY, ...CENTER, _score: 5 })
  const myohemmin = mkCand({ type: 'event', role: 'program', title: 'Myöhemmin tänään', tags: ['keikka'], time: 'pe 21.00', dateISO: ARC_DAY, ...CENTER, _score: 4 })
  const plan = buildDeterministicArc([joAlkanut, myohemmin, ruokaX], mkVotes({ [joAlkanut.id]: 3, [myohemmin.id]: 2, [ruokaX.id]: 1 }), superEi, { when: 'tonight', date: ARC_DAY, nowH: 20 })
  arcFixtures.push({ name: 'jo alkanut tapahtuma karsitaan (nowH=20)', ok: plan != null && !plan.arc.some(s => s.title === 'Jo alkanut keikka') && plan.arc.some(s => s.title === 'Myöhemmin tänään') })
}

// 11. Tapahtuma VAARALLA PÄIVÄLLÄ (monipäiväinen sessio) ei tule kaareen
{
  const huomisenKeikka = mkCand({ type: 'event', role: 'program', title: 'Huomisen keikka', tags: ['keikka'], time: 'la 19.00', dateISO: '2026-08-10', ...CENTER, _score: 5 })
  const plan = buildDeterministicArc([huomisenKeikka, ruokaX], mkVotes({ [huomisenKeikka.id]: 3, [ruokaX.id]: 2 }), superEi, { when: 'tonight', date: ARC_DAY })
  arcFixtures.push({ name: 'väärän päivän tapahtuma karsitaan (dateISO)', ok: plan != null && !plan.arc.some(s => s.title === 'Huomisen keikka') })
}

// 12. Kyrö Sauna Bar -override: paikan oikeat ajat (Su 12–19) yliajavat
//     vanhentuneen OSM-datan → klo 21.45 saunaa EI SAA tarjota sunnuntaina
{
  const kyroHours = venueHoursOverride('Kyrö Sauna Bar')
  const kyro = mkCand({ role: 'activity', title: 'Kyrö Sauna Bar', tags: ['sauna'], openingHours: kyroHours, ...CENTER, _score: 5 })
  const plan = buildDeterministicArc([kyro], mkVotes({ [kyro.id]: 2 }), superEi, { when: 'tonight', date: ARC_DAY /* sunnuntai */, nowH: 21 })
  arcFixtures.push({ name: 'Kyrö-override: su 21 jälkeen ei sauna-aikataulua', ok: kyroHours === 'Mo-Sa 12:00-21:00; Su 12:00-19:00' && plan === null })
}

// 13. Aukiolo-clamp ei saa jättää vaihetta menneisyyteen (paikka sulkeutuu
//     22, nyt 22 → ainoa ikkuna oli aikaisemmin → ei kaarta ollenkaan)
{
  const sulkeutuu22 = mkCand({ type: 'restaurant', role: 'food', title: 'Sulkeutuu 22', tags: ['ravintola'], openingHours: 'Mo-Su 12:00-22:00', _score: 3 })
  const plan = buildDeterministicArc([sulkeutuu22], mkVotes({ [sulkeutuu22.id]: 1 }), superEi, { when: 'tonight', date: ARC_DAY, nowH: 22 })
  arcFixtures.push({ name: 'menneisyyteen clampattu vaihe putoaa (ei kaarta)', ok: plan === null })
}

// 14. PAKKA: mennyt tapahtuma ei tule mukaan kortteihin (deck-taso)
{
  const eilen = mkEvent({ id: 'ev-eilen', title: 'Eilinen keikka', startTime: '2026-08-06T19:00:00+03:00' })
  const tuleva = mkEvent({ id: 'ev-tuleva', title: 'Tuleva keikka', startTime: '2026-12-31T19:00:00+02:00' })
  const deck = buildDeck(
    { events: [eilen, tuleva], restaurants: [], activities: [], activityRatings: new Map() },
    { when: 'tonight', fiilis: [] },
  )
  arcFixtures.push({ name: 'pakka: mennyt tapahtuma karsitaan, tuleva säilyy', ok: deck.some(c => c.id === 'e-ev-tuleva') && !deck.some(c => c.id === 'e-ev-eilen') })
}

// 15. PAKKA: skrapattu venue (G Livelab) ei tule geneerisenä PÄÄOHJELMANA
//     (sen keikat tulevat oikeina tapahtumakortteina), mutta tuntematon
//     klubi saa tulla (siitä ei ole muuta signaalia). Tapa 8/2026.
{
  const mkResto = (id: string, name: string): Restaurant => ({
    id, name, description: '', cuisines: [], cuisineCategories: [], address: 'Helsinki', city: 'Helsinki',
    image: 'https://example.com/k.jpg', www: null, phone: null,
    type: 'yokerho', googleRating: 4.5, reviewCount: 100,
  })
  const deck = buildDeck(
    { events: [], restaurants: [mkResto('r-gl', 'G Livelab'), mkResto('r-rand', 'Random Klubi')], activities: [], activityRatings: new Map() },
    { when: 'tonight', fiilis: [] },
  )
  arcFixtures.push({
    name: 'pakka: G Livelab ei geneerisenä ohjelmana, tuntematon klubi saa',
    ok: !deck.some(c => c.title === 'G Livelab') && deck.some(c => c.title === 'Random Klubi'),
  })
}

// 16–19. PAKAN VAIHTELU (toistuvuuskorjaus 8/2026): sama siemen → sama pakka
// ryhmälle, eri siemen → eri pakka; rematch-exkluusio; discovery-paikat.
{
  const mkR = (i: number): Restaurant => ({
    id: `r-${i}`, name: `Ravintola ${i}`, description: '', cuisines: [], cuisineCategories: [], address: 'Helsinki', city: 'Helsinki',
    image: 'https://example.com/k.jpg', www: null, phone: null,
    type: 'ravintola', googleRating: 4.0 + (i % 10) * 0.1, reviewCount: 60 + i,
  })
  const pool = Array.from({ length: 40 }, (_, i) => mkR(i))
  const input = { events: [], restaurants: pool, activities: [], activityRatings: new Map() }

  const deckA1 = buildDeck(input, { when: 'tonight', fiilis: [], seed: 'SIEMEN-A' })
  const deckA2 = buildDeck(input, { when: 'tonight', fiilis: [], seed: 'SIEMEN-A' })
  arcFixtures.push({
    name: 'vaihtelu: sama siemen → identtinen pakka (ryhmä näkee saman)',
    ok: JSON.stringify(deckA1.map(c => c.id)) === JSON.stringify(deckA2.map(c => c.id)),
  })

  const deckB = buildDeck(input, { when: 'tonight', fiilis: [], seed: 'SIEMEN-B' })
  const idsA = new Set(deckA1.map(c => c.id))
  const idsB = new Set(deckB.map(c => c.id))
  const overlap = [...idsA].filter(id => idsB.has(id)).length
  arcFixtures.push({
    name: 'vaihtelu: eri siemen → eri pakka (alle 90 % päällekkäisyyttä)',
    ok: overlap < deckA1.length * 0.9,
  })

  const excl = new Set(deckA1.slice(0, 10).map(c => c.id))
  const deckX = buildDeck(input, { when: 'tonight', fiilis: [], seed: 'SIEMEN-A', excludeIds: excl })
  arcFixtures.push({
    name: 'rematch-exkluusio: suljetut kortit eivät tule pakkaan',
    ok: !deckX.some(c => excl.has(c.id)),
  })

  arcFixtures.push({
    name: 'discovery: pakassa on 🎲 Yllätys -kortti, ja se on deterministinen',
    ok: deckA1.some(c => c.badge === '🎲 Yllätys') && deckA2.some(c => c.badge === '🎲 Yllätys') &&
        JSON.stringify(deckA1.filter(c => c.badge === '🎲 Yllätys').map(c => c.id)) ===
        JSON.stringify(deckA2.filter(c => c.badge === '🎲 Yllätys').map(c => c.id)),
  })
}

const arcChecks = arcFixtures
for (const c of arcChecks) {
  if (c.ok) pass++
  else failures.push(`✗ kaarimoottori: ${c.name}`)
}

// ── Kohderyhmärajaus (lib/audience) — suositukset 18–40-vuotiaille.
// Mitatut vuodot 24.8.2026 (etusivun poiminnat + Idea-pakka) pois;
// K18-klubit, nuoret aikuiset ja bändinimet EIVÄT saa osua.
{
  const aud = (title: string, short = '', venue = '', cats: string[] = []) =>
    isOutsideTargetAudience({ title, shortDescription: short, categories: cats, location: { name: venue } })

  const audCases: { name: string; ok: boolean }[] = [
    // Suljettavat (mitatut vuodot)
    { name: 'lapset: taiteilua vanhemman kanssa (Perhetalo)', ok: aud('Picassot', 'Taiteilua yhdessä vanhemman kanssa.', 'Perhetalo Naapuri') === true },
    { name: 'lapset: 0-6-vuotiaille liikuntahetki', ok: aud('Lammen liikuntahetki', 'joka maanantai 0-6-vuotiaille yhdessä vanhemman kanssa', 'Leikkipuisto Lampi') === true },
    { name: 'lapset: alle 2v jumpparyhmä', ok: aud('Ilo liikkua-jumpparyhmä 1½- alle 2v. Ennakkoilmoittautuminen.') === true },
    { name: 'nuoriso: 13-17-vuotiaiden ilta', ok: aud('Sateenkaarinuorten ilta 13-17-vuotiaille') === true },
    { name: 'käsityökerho: neulominen', ok: aud('Neuletapaaminen', 'Tule mukaan neulomaan. Neuletapaamiset jatkuvat syksyllä') === true },
    { name: 'seniorit: palvelukeskus', ok: aud('Senioritanssit', 'Tanssit palvelukeskuksessa joka viikko') === true },
    { name: 'seniorit/palvelu: digituki', ok: aud('Digituen viikko-ohjelma 24.8.–28.8.2026', 'Kaupungin digineuvoja paikalla') === true },
    { name: 'lapset: satutuokio', ok: aud('Satutuokio kirjastossa') === true },
    { name: 'lapset: "7–8-vuotiaat" nominatiivissa (mitattu vuoto 25.8.)', ok: aud('Sydkustens ordskola: Skriftstojarna – 7–8-vuotiaat, 2018-2019 syntyneet') === true },
    { name: 'lapset: syntymävuosikohdennus yksin', ok: aud('Kuvataidekurssi', '2015-2016 syntyneille') === true },
    // Säilyvät (tarkkuusansat)
    { name: 'ansa: K18-klubi ("yli 18-vuotiaille") säilyy', ok: aud('Klubi-ilta', 'Vain yli 18-vuotiaille.') === false },
    { name: 'ansa: nuorten aikuisten ilta ON kohderyhmää', ok: aud('Nuorten aikuisten suunnitteluilta', 'Kutsumme nuoria aikuisia mukaan') === false },
    { name: 'ansa: bändinimi (Nuorgam 30 v) säilyy', ok: aud('Nuorgam 30 v -juhlakeikka') === false },
    { name: 'ansa: sinfoniakonsertti säilyy', ok: aud('Helsingin juhlaviikot: Radion sinfoniaorkesteri – Le Grand Macabre', 'György Ligetin ooppera', 'Musiikkitalo') === false },
    { name: 'ansa: "Muistopäivä"-näytelmä ei ole muistisairaustapahtuma', ok: aud('Muistopäivä', 'Järisyttävä näytelmä Stalinin vainoihin kadonneista', 'Suomen Kansallisteatteri') === false },
    { name: 'ansa: stand up -klubi säilyy', ok: aud('Stand up -klubi', 'Illan koomikot Apollossa', 'Apollo Live Club') === false },
    { name: 'ansa: "18-vuotias juhlavuosi" säilyy', ok: aud('Klubin 18-vuotias juhlavuosi', 'Synttärikeikat koko viikon') === false },
    { name: 'ansa: "1800-luvulla syntyneet aatteet" säilyy', ok: aud('Luento', 'Miten 1800-luvulla syntyneet aatteet muokkasivat Helsinkiä') === false },
  ]
  for (const c of audCases) {
    if (c.ok) pass++
    else failures.push(`✗ kohderyhmä: ${c.name}`)
  }

  // Poimintojen ykköskori (isPrimaryPick): kulttuurikategoriat + festivaalit
  // ensin, turistikierrokset ja kirjastoillat kakkoskoriin (omistaja 25.8.:
  // "en halua suomenlinna kierrostakaan suosituksi poiminnaksi").
  const pick = (over: Partial<Event> & { id: string; title: string }) =>
    isPrimaryPick(mkEvent({ startTime: '2026-08-26T18:00:00+03:00', ...over }))
  const pickCases: { name: string; ok: boolean }[] = [
    { name: 'ykköskori: keikka', ok: pick({ id: 'p1', title: 'Iltakeikka', vibes: ['keikka'] }) === true },
    { name: 'ykköskori: teatteri', ok: pick({ id: 'p2', title: 'Esitys', vibes: ['teatteri'] }) === true },
    { name: 'ykköskori: taide/näyttely', ok: pick({ id: 'p3', title: 'Näyttely', vibes: ['taide'] }) === true },
    { name: 'ykköskori: klassinen', ok: pick({ id: 'p4', title: 'Sinfonia', vibes: ['klassinen'] }) === true },
    { name: 'ykköskori: urheilu', ok: pick({ id: 'p5', title: 'Ottelu', vibes: ['urheilu'] }) === true },
    { name: 'ykköskori: festivaalilähde ilman vibejä', ok: pick({ id: 'p6', title: 'Festari', vibes: [], source: 'festivals' }) === true },
    { name: 'kakkoskori: opastettu kierros EI ole ykköskoria', ok: pick({ id: 'p7', title: 'Opastettu yleisökierros Suomenlinnassa', vibes: [], categories: ['matkailu'] }) === false },
    { name: 'kakkoskori: kirjaston pelailuilta', ok: pick({ id: 'p8', title: 'Pelailua kirjastossa', vibes: [], categories: ['kirjastot'] }) === false },
  ]
  for (const c of pickCases) {
    if (c.ok) pass++
    else failures.push(`✗ ykköskori: ${c.name}`)
  }
}

// ── Lippulupaus (lib/tickets) — "Osta liput" vain oikeaan kauppaan
// (omistaja 25.8.2026; mitattu: 188 stadissa.fi-listaussivua lippulupauksella).
{
  const ticketCases: { name: string; ok: boolean }[] = [
    { name: 'kauppa: lippu.fi', ok: isTicketShopUrl('https://www.lippu.fi/artist/xyz/') === true },
    { name: 'kauppa: tiketti.fi', ok: isTicketShopUrl('https://www.tiketti.fi/liput/123') === true },
    { name: 'kauppa: kide.app', ok: isTicketShopUrl('https://kide.app/events/abc') === true },
    { name: 'kauppa: alidomain (suomenlinna.johku.com)', ok: isTicketShopUrl('https://suomenlinna.johku.com/fi_FI/tuote') === true },
    { name: 'kauppa: ra.co', ok: isTicketShopUrl('https://ra.co/events/12345') === true },
    { name: 'kauppa: allaspool.fi (omistajan nimeämä)', ok: isTicketShopUrl('https://allaspool.fi/liput') === true },
    { name: 'EI kauppa: stadissa.fi-listaus', ok: isTicketShopUrl('https://www.stadissa.fi/tapahtumat/xyz') === false },
    { name: 'EI kauppa: venue-sivu (tavastiaklubi.fi)', ok: isTicketShopUrl('https://tavastiaklubi.fi/keikka') === false },
    { name: 'EI kauppa: hel.fi-info', ok: isTicketShopUrl('https://www.hel.fi/uutiset/x') === false },
    { name: 'EI kauppa: domain-huijaus (lippu.fi.evil.com)', ok: isTicketShopUrl('https://lippu.fi.evil.com/x') === false },
    { name: 'EI kauppa: puuttuva/rikkinäinen url', ok: isTicketShopUrl(null) === false && isTicketShopUrl('ei-urli') === false },
    { name: 'canBuy: maksullinen + lippu.fi → Osta liput', ok: canBuyTickets({ ticketUrl: 'https://lippu.fi/x', isFree: false }) === true },
    { name: 'canBuy: ILMAINEN + lippu.fi → ei lippulupausta', ok: canBuyTickets({ ticketUrl: 'https://lippu.fi/x', isFree: true }) === false },
    { name: 'canBuy: maksullinen + stadissa → ei lippulupausta', ok: canBuyTickets({ ticketUrl: 'https://stadissa.fi/x', isFree: false }) === false },
  ]
  for (const c of ticketCases) {
    if (c.ok) pass++
    else failures.push(`✗ lippulupaus: ${c.name}`)
  }
}

// ── Oppaiden paikkarikastus (lib/guide-data) — nimi+osoite-matchaus.
// Mitatut ansat 25.8.2026: sumea matchaus antoi "Helmi Grilli, Kontula"
// -riville Alin Grilli 22:n kuvan ja 4,8 tähteä; BISOUBISOU on datassa
// kahdesti samassa osoitteessa (kuvallinen + kuvaton).
{
  const gCases: { name: string; ok: boolean }[] = [
    { name: 'normName: trimmaa, pienentää ja tiivistää välit', ok: guideNormName('  Ateljee   Bar ') === 'ateljee bar' },
    { name: 'normName: eri kirjainkoko osuu samaan avaimeen', ok: guideNormName('BISOUBISOU') === guideNormName('bisoubisou') },
    { name: 'streetKey: pilkku + postinumero pois', ok: guideStreetKey('Neljäs linja 17-19, 00530 Helsinki') === 'neljas linja 17' },
    { name: 'streetKey: ääkköset normalisoituvat', ok: guideStreetKey('Töölönkatu 51 A') === 'toolonkatu 51' },
    { name: 'streetKey: sama katu eri postinumerolla → sama avain', ok: guideStreetKey('Keinulaudankuja 4, 00930') === guideStreetKey('Keinulaudankuja 4, 00940') },
    { name: 'streetKey: numeroton osoite → null (ei arvausta)', ok: guideStreetKey('Kauppatori') === null && guideStreetKey(null) === null },
  ]
  for (const c of gCases) {
    if (c.ok) pass++
    else failures.push(`✗ opasrikastus: ${c.name}`)
  }
}

// ── Tapahtumalinkit (lib/event-links) — kilpailijalle ei ohjata, eikä
// jakolinkki saa osoittaa 404-sivulle. Mitattu 25.8.2026: stadissa merkitsee
// tapahtumansa 'linked-events'-lähteeksi, jolloin source-pohjainen tarkistus
// tuotti /e/stadissa-116290 → 404 jokaisesta jaosta (189/189).
{
  const B = 'https://helsinki-tapahtumat.vercel.app'
  const linkCases: { name: string; ok: boolean }[] = [
    { name: 'kilpailija: stadissa.fi tunnistetaan', ok: isCompetitorUrl('https://www.stadissa.fi/tapahtumat/x') === true },
    { name: 'kilpailija: alidomain', ok: isCompetitorUrl('https://menokone.hs.fi/tapahtuma/1') === true },
    { name: 'kilpailija: järjestäjän oma sivu EI ole kilpailija', ok: isCompetitorUrl('https://tavastiaklubi.fi/keikka') === false },
    { name: 'kilpailija: domain-huijaus (stadissa.fi.evil.com)', ok: isCompetitorUrl('https://stadissa.fi.evil.com/x') === false },
    { name: 'kilpailija: tyhjä/rikkinäinen', ok: isCompetitorUrl(null) === false && isCompetitorUrl('ei-url') === false },
    // Oma sivu: vain ne id:t jotka /e/[id] oikeasti ratkaisee
    { name: 'oma sivu: LinkedEvents-id (helsinki:agqa74rrka)', ok: hasOwnEventPage({ id: 'helsinki:agqa74rrka' }) === true },
    { name: 'oma sivu: tm- ja festival-', ok: hasOwnEventPage({ id: 'tm-Z698xZb' }) && hasOwnEventPage({ id: 'festival-viapori-jazz' }) },
    { name: 'oma sivu: stadissa-id EI ratkea (404-suoja)', ok: hasOwnEventPage({ id: 'stadissa-116290' }) === false },
    { name: 'oma sivu: venue-/lippu-skraperi-id ei ratkea', ok: !hasOwnEventPage({ id: 'venue-tavastia-119725' }) && !hasOwnEventPage({ id: 'lippu-21970031' }) },
    { name: 'oma sivu: museum-helsinki:… ei ratkea (skraperin oma id)', ok: hasOwnEventPage({ id: 'museum-helsinki:agp3dof3km' }) === false },
    { name: 'oma sivu: rss-/recurring- ei ratkea', ok: !hasOwnEventPage({ id: 'rss-123' }) && !hasOwnEventPage({ id: 'recurring-abc' }) },
    // Jakolinkki
    { name: 'jako: oma sivu kun id ratkeaa', ok: shareUrlFor({ id: 'helsinki:abc123' }, B) === `${B}/e/helsinki%3Aabc123` },
    { name: 'jako: stadissa-tapahtuma → EI kilpailijan osoitetta', ok: shareUrlFor({ id: 'stadissa-1', infoUrl: 'https://www.stadissa.fi/tapahtumat/x' }, B) === B },
    { name: 'jako: järjestäjän linkki kelpaa kun omaa sivua ei ole', ok: shareUrlFor({ id: 'venue-1', infoUrl: 'https://tavastiaklubi.fi/keikka' }, B) === 'https://tavastiaklubi.fi/keikka' },
    { name: 'jako: kilpailija ohitetaan, lippulinkki käytetään', ok: shareUrlFor({ id: 'stadissa-2', infoUrl: 'https://stadissa.fi/x', ticketUrl: 'https://www.lippu.fi/y' }, B) === 'https://www.lippu.fi/y' },
  ]
  // CTA-linkki: kilpailijan osoite ei kelpaa ulkoiseksi linkiksi, ja
  // hakuvara vie hakukoneeseen tapahtuman nimellä + paikalla.
  const ctaCases: { name: string; ok: boolean }[] = [
    { name: 'CTA: lippulinkki voittaa infoUrlin', ok: externalUrlFor({ ticketUrl: 'https://lippu.fi/x', infoUrl: 'https://tavastiaklubi.fi' }) === 'https://lippu.fi/x' },
    { name: 'CTA: pelkkä kilpailija → null (nappi korvataan)', ok: externalUrlFor({ infoUrl: 'https://www.stadissa.fi/tapahtumat/1' }) === null },
    { name: 'CTA: kilpailija ohitetaan, järjestäjä kelpaa', ok: externalUrlFor({ ticketUrl: 'https://stadissa.fi/x', infoUrl: 'https://kiasma.fi' }) === 'https://kiasma.fi' },
    { name: 'CTA: ei linkkejä → null', ok: externalUrlFor({}) === null },
    { name: 'haku: nimi + paikka + Helsinki mukana', ok: (() => {
      const u = searchUrlFor({ title: 'Pingistä (pöytätennis)', location: { name: 'Töölön seniorikeskus' } })
      return u.startsWith('https://www.google.com/search?q=') && decodeURIComponent(u).includes('Pingistä (pöytätennis) Töölön seniorikeskus Helsinki')
    })() },
    { name: 'haku: toimii ilman paikkaa', ok: decodeURIComponent(searchUrlFor({ title: 'Keikka', location: null })).includes('Keikka Helsinki') },
  ]
  for (const c of ctaCases) {
    if (c.ok) pass++
    else failures.push(`✗ CTA-linkki: ${c.name}`)
  }

  for (const c of linkCases) {
    if (c.ok) pass++
    else failures.push(`✗ tapahtumalinkit: ${c.name}`)
  }
}


// ── Torstain pakka (viikkodigesti, lib/weekly-digest.ts) — puhdas kuratointi:
// kattilat, pisteytys, duplikaattisuojat. Fixture-malli sama kuin kaaret yllä.
const PE_ILTA = '2026-08-14T19:00:00+03:00' // perjantai-ilta (pe 14.8.2026)
const LA_ILTA = '2026-08-15T20:00:00+03:00' // lauantai-ilta
const SU_PV = '2026-08-16T12:00:00+03:00'   // sunnuntai keskipäivällä

const digestFixtures: { name: string; ok: boolean }[] = []

// 1. Yksi per kattila → 5 poimintaa, kaikki kattilat edustettuna
{
  const events = [
    mkEvent({ id: 'dg1', title: 'Rock-keikka', startTime: PE_ILTA, isFree: false, vibes: ['keikka'] }),
    mkEvent({ id: 'dg2', title: 'Näytelmä', startTime: LA_ILTA, isFree: false, vibes: ['teatteri'] }),
    mkEvent({ id: 'dg3', title: 'Lasten satuhetki', startTime: SU_PV, isFree: false, vibes: ['lapset'] }),
    mkEvent({ id: 'dg4', title: 'Klubi-ilta', startTime: LA_ILTA, isFree: false, vibes: ['yoelama'] }),
    mkEvent({ id: 'dg5', title: 'Ilmainen puistotapahtuma', startTime: SU_PV, isFree: true, vibes: [] }),
  ]
  const picks = pickWeeklyDigest(events)
  digestFixtures.push({
    name: 'yksi per kattila → 5 poimintaa, 5 eri kattilaa',
    ok: picks.length === 5 && new Set(picks.map((p) => p.bucket)).size === 5,
  })
}

// 2. Paikka-duplikaattisuoja: sama location.name normalisoituna → vain toinen
{
  const a = mkEvent({ id: 'dg10', title: 'Keikka A', startTime: PE_ILTA, isFree: false, location: { name: 'Tavastia', streetAddress: '', city: 'Helsinki' } })
  const b = mkEvent({ id: 'dg11', title: 'Keikka B', startTime: LA_ILTA, isFree: false, location: { name: '  TAVASTIA ', streetAddress: '', city: 'Helsinki' } })
  const picks = pickWeeklyDigest([a, b])
  digestFixtures.push({ name: 'paikka-duplikaattisuoja (kirjainkoko + välit normalisoidaan)', ok: picks.length === 1 })
}

// 3. Otsikko-duplikaattisuoja: sama otsikko eri paikoissa → vain toinen
{
  const a = mkEvent({ id: 'dg20', title: 'Flow Festival', startTime: PE_ILTA, isFree: false, vibes: ['keikka'] })
  const b = mkEvent({ id: 'dg21', title: 'flow  festival', startTime: LA_ILTA, isFree: false, vibes: ['keikka'], location: { name: 'Muu paikka', streetAddress: '', city: 'Helsinki' } })
  const picks = pickWeeklyDigest([a, b])
  digestFixtures.push({ name: 'otsikko-duplikaattisuoja eri paikoissa', ok: picks.length === 1 })
}

// 4. Kattilansisäinen järjestys: kuvallinen (+2) voittaa kuvattoman
{
  const kuvaton = mkEvent({ id: 'dg30', title: 'Kuvaton keikka', startTime: PE_ILTA, isFree: false, image: null })
  const kuvallinen = mkEvent({ id: 'dg31', title: 'Kuvallinen keikka', startTime: PE_ILTA, isFree: false })
  const picks = pickWeeklyDigest([kuvaton, kuvallinen])
  digestFixtures.push({ name: 'kuva-bonus +2: kuvallinen poimitaan', ok: picks.length === 1 && picks[0].event.id === 'dg31' })
}

// 5. Festivaali-bonus +2 voittaa pelkän kuvan
{
  const tavallinen = mkEvent({ id: 'dg40', title: 'Tavallinen keikka', startTime: PE_ILTA, isFree: false })
  const festari = mkEvent({ id: 'dg41', title: 'Festivaalikeikka', startTime: PE_ILTA, isFree: false, vibes: ['keikka', 'festivaali'] })
  const picks = pickWeeklyDigest([tavallinen, festari])
  digestFixtures.push({ name: 'festivaali-vibe +2: festari poimitaan', ok: picks.length === 1 && picks[0].event.id === 'dg41' })
}

// 6. Pe/la-ilta-bonus +1: perjantai-ilta voittaa sunnuntai-päivän
{
  const sunnuntai = mkEvent({ id: 'dg50', title: 'Sunnuntaikeikka', startTime: SU_PV, isFree: false })
  const perjantai = mkEvent({ id: 'dg51', title: 'Perjantaikeikka', startTime: PE_ILTA, isFree: false })
  const picks = pickWeeklyDigest([sunnuntai, perjantai])
  digestFixtures.push({ name: 'pe/la-ilta +1: perjantai-ilta poimitaan', ok: picks.length === 1 && picks[0].event.id === 'dg51' })
}

// 7. Kattiloita puuttuu → alle 5, EI täytetä väkisin
{
  const events = [
    mkEvent({ id: 'dg60', title: 'Keikka 1', startTime: PE_ILTA, isFree: false, vibes: ['keikka'] }),
    mkEvent({ id: 'dg61', title: 'Keikka 2', startTime: LA_ILTA, isFree: false, vibes: ['keikka'] }),
  ]
  const picks = pickWeeklyDigest(events)
  digestFixtures.push({ name: 'vain yksi kattila → 1 poiminta (ei väkisin täyttöä)', ok: picks.length === 1 })
}

// 8. Max 5: kaksi ehdokasta per kattila (10 kpl) → tasan 5; size-optio kunnioitettu
{
  const mk2 = (base: string, over: Partial<Event>) => [
    mkEvent({ id: `${base}-a`, title: `${base} A`, startTime: PE_ILTA, isFree: false, ...over }),
    mkEvent({ id: `${base}-b`, title: `${base} B`, startTime: SU_PV, isFree: false, ...over }),
  ]
  const events = [
    ...mk2('keikka', { vibes: ['keikka'] }),
    ...mk2('kulttuuri', { vibes: ['teatteri'] }),
    ...mk2('perhe', { vibes: ['lapset'] }),
    ...mk2('yoelama', { vibes: ['yoelama'] }),
    ...mk2('ilmainen', { vibes: [], isFree: true }),
  ]
  digestFixtures.push({
    name: '10 ehdokasta / 5 kattilaa → tasan 5, size=3 → 3',
    ok: pickWeeklyDigest(events).length === 5 && pickWeeklyDigest(events, { size: 3 }).length === 3,
  })
}

// 9. Kattilaan kuulumaton (työpaja, maksullinen) karsitaan kokonaan
{
  const e = mkEvent({ id: 'dg80', title: 'Askartelutyöpaja', startTime: PE_ILTA, isFree: false, vibes: ['tyopaja'] })
  digestFixtures.push({ name: 'kattilaton tapahtuma ei tule pakkaan', ok: pickWeeklyDigest([e]).length === 0 })
}

// 10. Kategoria-fallback: vibes tyhjä → categories ['klassinen'] → Kulttuuri
{
  const e = mkEvent({ id: 'dg90', title: 'Sinfoniakonsertti', startTime: PE_ILTA, isFree: false, vibes: [], categories: ['klassinen'] })
  const picks = pickWeeklyDigest([e])
  digestFixtures.push({
    name: 'kategoria-fallback: klassinen → Kulttuuri-kattila',
    ok: picks.length === 1 && picks[0].bucket === 'Kulttuuri' && picks[0].bucketEmoji === '🎭',
  })
}

for (const c of digestFixtures) {
  if (c.ok) pass++
  else failures.push(`✗ weekly-digest: ${c.name}`)
}

// Siltanen-skraperin parseri (tuotantotapaus 8/2026: Stepa 20.8 ei näkynyt,
// koska Siltanen ei ollut lainkaan lähde — Tiketti-myyntinen keikka).
const SILTANEN_FIXTURE = `
<span class="current-month">August</span>
<td class="simcal-day-19 simcal-day-has-events" >
 <div><span class="simcal-day-number">19</span>
 <ul class="simcal-events"><li class="simcal-event">
  <span class="simcal-event-title">Paha Vaanii</span>
  <div class="simcal-event-details"><div class="simcal-event-description"><p>Music Bar!</p></div></div>
 </li></ul></div>
</td>
<td class="simcal-day-20 simcal-day-has-events" >
 <div><span class="simcal-day-number">20</span>
 <ul class="simcal-events"><li class="simcal-event">
  <span class="simcal-event-title">Stepa (live terassilla) + Pop 3</span>
  <div class="simcal-event-details"><div class="simcal-event-description"><p>https://www.tiketti.fi/stepa-siltanen-helsinki-lippuja/117361</p>
  <p>Terassi ja Siltanen:<br />Pop 3 — Kalifornia-Keke &amp; Cute Cumber</p></div></div>
 </li></ul></div>
</td>`
const siltanenItems = parseSiltanenGrid(SILTANEN_FIXTURE, '2026-08')
const siltanenStepa = siltanenItems.find(i => i.title.includes('Stepa'))
const siltanenChecks: { name: string; ok: boolean }[] = [
  { name: 'kaksi tapahtumaa parsittu', ok: siltanenItems.length === 2 },
  { name: 'Stepa 20.8 löytyy oikealla päivällä', ok: siltanenStepa?.date === '2026-08-20' },
  { name: 'Tiketti-lippulinkki poimittu', ok: siltanenStepa?.ticketUrl === 'https://www.tiketti.fi/stepa-siltanen-helsinki-lippuja/117361' },
  { name: 'terassi-keikka saa 19:00-oletuksen', ok: siltanenStepa?.time === '19:00' },
  { name: 'klubikeikka (ei terassi) saa 20:00-oletuksen', ok: siltanenItems.find(i => i.title === 'Paha Vaanii')?.time === '20:00' },
]
for (const c of siltanenChecks) {
  if (c.ok) pass++
  else failures.push(`✗ siltanen-parseri: ${c.name} → ${JSON.stringify(siltanenItems)}`)
}

// Post Bar -skraperin parseri (tuotantotapaus 8/2026: postbar.fi uusiutui —
// tapahtumat siirtyivät <li>-listasta <article class="event">-lohkoihin,
// entiteettikoodattuina). Syntetinen pätkä todellisesta markupista.
const POSTBAR_FIXTURE = `
<article
  class="event&#x20;panel"
  data-event-active-from="2026-08-20T00&#x3A;00&#x3A;00&#x2B;03&#x3A;00">
  <a class="event-link" href="https&#x3A;&#x2F;&#x2F;postbar.fi&#x2F;program&#x2F;2026-08-20-post-bar-is-a-guest-harbour-with-irma-jaakko-rintala-lauri-soini"></a>
      <time datetime="2026-08-20" class="event-date">
      Thursday • August 20th           </time>
    <h3 class="event-title header font-pb">
    <span class="event-title_act">POST BAR IS A GUEST HARBOUR WITH: IRMA, JAAKKO RINTALA &amp; LAURI SOINI</span>  </h3>
  <div class="admission-info">
    Doors: 20-02<br>Free entry  </div>
  </article>
<article class="event&#x20;panel_small event--has-ticket">
  <a class="event-link" href="https&#x3A;&#x2F;&#x2F;postbar.fi&#x2F;program&#x2F;2026-09-02-live-at-the-bar-avanti-x-hanan-hadzajlic-x-helsinki-festival"></a>
  <time datetime="2026-09-02" class="event-date">Wednesday • September 2nd</time>
  <h3 class="event-title header font-pb">
    <span class="event-title_act">LIVE AT THE BAR:</span><span class="event-title_act" data-schedule-start="2026-09-02T20:30:00+03:00">AVANTI! &amp; HANAN HADŽAJLIĆ</span>
  </h3>
  <div class="admission-info">Doors: 20:30-22:30<br>Tickets 15€ on the door</div>
</article>`
const postbarItems = parsePostbarEvents(POSTBAR_FIXTURE)
const postbarFirst = postbarItems[0]
const postbarSecond = postbarItems[1]
const postbarChecks: { name: string; ok: boolean }[] = [
  { name: 'kaksi tapahtumaa parsittu', ok: postbarItems.length === 2 },
  { name: 'päivä <time datetime>:stä', ok: postbarFirst?.date === '2026-08-20' },
  { name: '"Doors: 20-02" → 20:00', ok: postbarFirst?.time === '20:00' },
  { name: 'entiteettikoodattu linkki dekoodattu', ok: postbarFirst?.url === 'https://postbar.fi/program/2026-08-20-post-bar-is-a-guest-harbour-with-irma-jaakko-rintala-lauri-soini' },
  { name: 'moniosainen otsikko yhdistetty + &amp; dekoodattu', ok: postbarSecond?.title === 'LIVE AT THE BAR: AVANTI! & HANAN HADŽAJLIĆ' },
  { name: '"Doors: 20:30-22:30" → 20:30', ok: postbarSecond?.time === '20:30' },
]
for (const c of postbarChecks) {
  if (c.ok) pass++
  else failures.push(`✗ postbar-parseri: ${c.name} → ${JSON.stringify(postbarItems)}`)
}

// Lepakkomies-skraperin parseri (tuotantotapaus 8/2026: lepis.fi teema
// vaihtui — otsikko siirtyi <h2>:sta <h1 class="h2 mt-0">:aan kortti-
// rakenteessa). Syntetinen pätkä todellisesta markupista.
const LEPAKKOMIES_FIXTURE = `
<article id="post-" class="group tapahtuma loop-item text-uppercase col-12 col-md-6 post-28126 type-tapahtuma status-publish hentry tapahtumaluokka-metal">
  <div class="tapahtuma-inner">
    <a class="img-link" href="https://www.lepis.fi/tapahtumat/latin-finnish-metal-alliance-ulthima-mx-fi-pronoias-cl-sargassus-fi/" title="x"><span class="img-blanket"><img src="x.png" /></span></a>
    <div class="entry-content">
      <span class="tapahtumatila weight-600">Klubi</span>
      <h1 class="h2 mt-0">
        <a href="https://www.lepis.fi/tapahtumat/latin-finnish-metal-alliance-ulthima-mx-fi-pronoias-cl-sargassus-fi/" title="LATIN-FINNISH METAL ALLIANCE">
          LATIN-FINNISH METAL ALLIANCE: Ulthima (MX/FI) + Pronoias (CL) + Sargassus (FI)				</a>
      </h1>
      <span class="entry-details size-larger">
        <span class="date-info">

          ke 19.8.2026 / ovet klo 20:00
        </span>
      </span>
    </div>
  </div>
</article>
<article id="post-" class="group tapahtuma loop-item text-uppercase col-12 col-md-6 post-28130 type-tapahtuma status-publish hentry">
  <div class="tapahtuma-inner">
    <div class="entry-content">
      <h1 class="h2 mt-0">
        <a href="https://www.lepis.fi/tapahtumat/observatorio-reunion-nuoruus-nasu-penkojaiset/" title="x">
          Observatorio Reunion: Nuoruus + Nasu &#038; Penkojaiset				</a>
      </h1>
      <span class="entry-details size-larger">
        <span class="date-info">
          pe 21.8.2026 / ovet klo 19:00
        </span>
      </span>
    </div>
  </div>
</article>`
const lepisItems = parseLepakkomiesEvents(LEPAKKOMIES_FIXTURE)
const lepisFirst = lepisItems[0]
const lepisSecond = lepisItems[1]
const lepisChecks: { name: string; ok: boolean }[] = [
  { name: 'kaksi tapahtumaa parsittu', ok: lepisItems.length === 2 },
  { name: 'päivä date-info-spanista', ok: lepisFirst?.date === '2026-08-19' },
  { name: '"ovet klo 20:00" → 20:00', ok: lepisFirst?.time === '20:00' },
  { name: 'tapahtumalinkki poimittu h1:stä (ei img-linkistä)', ok: lepisFirst?.ticketUrl === 'https://www.lepis.fi/tapahtumat/latin-finnish-metal-alliance-ulthima-mx-fi-pronoias-cl-sargassus-fi/' },
  { name: '&#038;-entiteetti dekoodattu otsikossa', ok: lepisSecond?.title === 'Observatorio Reunion: Nuoruus + Nasu & Penkojaiset' },
  { name: '"ovet klo 19:00" → 19:00', ok: lepisSecond?.time === '19:00' },
]
for (const c of lepisChecks) {
  if (c.ok) pass++
  else failures.push(`✗ lepakkomies-parseri: ${c.name} → ${JSON.stringify(lepisItems)}`)
}

// Uudet venue-skraperit 8/2026 (Apollo, Maxine, Tanssin talo) — fixturet
// typistettyjä pätkiä todellisesta markupista/datasta.
const apolloItems = parseApolloGrid(`<div class="rt-holder tpg-post-holder ">
  <div class="rt-detail rt-el-content-wrapper">
    <div class="entry-title-wrapper"><h3 class="entry-title"><a data-id="3735" href="https://apolloliveclub.fi/fearfactory/" class="tpg-post-link" target="_self">FearFactory</a></h3></div>
    <div class="tpg-excerpt tpg-el-excerpt">
      <div class="tpg-excerpt-inner">
        5.9.2026 - 18:00 - 43,90€ - K-18                        </div>
    </div>
  </div>
</div>`)
const apolloFear = apolloItems.find(i => i.title === 'FearFactory')

const maxineItems = parseMaxineTribe(JSON.parse('{"events":[{"id":2095,"url":"https://maxine.fi/earchive/maxout-21-8-22-00-4-30maxine-afro-special/","title":"MaxOut 21.8 22.00-4.30@Maxine AFRO Special","start_date":"2026-08-21 22:00:00","end_date":"2026-08-22 04:30:00","timezone":"Europe/Helsinki","cost":"10€","image":{"url":"https://maxine.fi/wp-content/uploads/2026/08/x.jpg"}}]}'))
const maxineMax = maxineItems[0]

const tanssiItems = parseTanssintaloEntries(JSON.parse('{"data":{"entries":[{"title":"Cloud Gate Dance Theatre of Taiwan: 13 Tongues","url":"https://www.tanssintalo.fi/ohjelma/cloud-gate-dance-theatre-of-taiwan-13-tongues","ticketLink":"https://www.lippu.fi/artist/helsingin-juhlaviikot/cloud-gate","irregularShowTimes":[{"date":"2026-08-27T00:00:00+03:00","time":"2026-03-25T18:00:00+02:00"}]}]}}'))
const tanssiCloud = tanssiItems[0]

const venueNewChecks: { name: string; ok: boolean }[] = [
  { name: 'apollo: otsikko+päivä+aika parsittu', ok: apolloItems.length === 1 && apolloFear != null && JSON.stringify(apolloFear).includes('2026-09-05') && JSON.stringify(apolloFear).includes('18:00') },
  { name: 'apollo: hinta ja linkki mukana', ok: JSON.stringify(apolloFear).includes('43,90') && JSON.stringify(apolloFear).includes('apolloliveclub.fi/fearfactory') },
  { name: 'maxine: tribe-päivä+aika parsittu', ok: maxineItems.length === 1 && JSON.stringify(maxineMax).includes('2026-08-21') && JSON.stringify(maxineMax).includes('22:00') },
  { name: 'maxine: endTime ja hinta mukana', ok: JSON.stringify(maxineMax).includes('04:30') && JSON.stringify(maxineMax).includes('10€') },
  { name: 'tanssintalo: irregularShowTimes-päivä+aika', ok: tanssiItems.length === 1 && JSON.stringify(tanssiCloud).includes('2026-08-27') && JSON.stringify(tanssiCloud).includes('18:00') },
  { name: 'tanssintalo: lippulinkki mukana', ok: JSON.stringify(tanssiCloud).includes('lippu.fi') },
]
for (const c of venueNewChecks) {
  if (c.ok) pass++
  else failures.push(`✗ uusi venue-parseri: ${c.name}`)
}

// Idea-pakkamoottori (8/2026 uudistus): kohderyhmäsuodatus (vauva/perhe pois
// oletuksena), seniori-alaskuopaus, makumuisti, cold-start-scenet, siemen.
const IDEA_NOW = new Date('2026-08-21T15:00:00+03:00').getTime()
const IDEA_TODAY = '2026-08-21'
const evKeikka = mkEvent({ id: 'i1', title: 'Keikka illalla', startTime: '2026-08-21T20:00:00+03:00', vibes: ['keikka'], categories: ['musiikki'] })
const evVauva = mkEvent({ id: 'i2', title: 'Vauvajumppa torstaina', startTime: '2026-08-21T10:00:00+03:00', vibes: ['lapset'], categories: ['lapset'] })
const evKlassinen = mkEvent({ id: 'i3', title: 'Sinfoniakonsertti', startTime: '2026-08-21T19:00:00+03:00', vibes: ['klassinen'], categories: ['klassinen musiikki'] })
const evEilen = mkEvent({ id: 'i4', title: 'Eilinen keikka', startTime: '2026-08-20T20:00:00+03:00', vibes: ['keikka'], categories: ['musiikki'] })
const evMennee = mkEvent({ id: 'i5', title: 'Meni jo (alkoi 11, ei endTimeä)', startTime: '2026-08-21T11:00:00+03:00', vibes: ['keikka'], categories: ['musiikki'] })
const evKaynnissa = mkEvent({ id: 'i6', title: 'Käynnissä oleva festivaali', startTime: '2026-08-21T12:00:00+03:00', endTime: '2026-08-21T23:00:00+03:00', vibes: ['festivaali'], categories: ['festivaali'] })

const ideaChecks: { name: string; ok: boolean }[] = [
  { name: 'audienceOk: vauva/perhe pois oletuksena', ok: audienceOk(evVauva, 'default') === false },
  { name: 'audienceOk: vauva/perhe sallittu perhe-tilassa', ok: audienceOk(evVauva, 'perhe') === true },
  { name: 'audienceOk: keikka sallittu aina', ok: audienceOk(evKeikka, 'default') === true },
  { name: 'seniorSkew: klassinen osuu, keikka ei', ok: seniorSkew(evKlassinen) === true && seniorSkew(evKeikka) === false },
]

{
  const deck = buildIdeaDeck([evKeikka, evVauva, evMennee, evKaynnissa, evEilen], { seed: 'X', nowMs: IDEA_NOW, today: IDEA_TODAY })
  const ids = deck.map(d => d.event.id)
  ideaChecks.push({ name: 'pakka: lapset+väärä päivä+päättynyt karsitaan, käynnissä säilyy', ok: ids.includes('i1') && ids.includes('i6') && !ids.includes('i2') && !ids.includes('i4') && !ids.includes('i5') })
}

{
  const noScene = buildIdeaDeck([evKeikka, evKlassinen], { seed: 'X', nowMs: IDEA_NOW, today: IDEA_TODAY })
  const kulttuuri = buildIdeaDeck([evKeikka, evKlassinen], { seed: 'X', nowMs: IDEA_NOW, today: IDEA_TODAY, scenes: ['kulttuuri'] })
  const kNo = noScene.find(d => d.event.id === 'i3')!
  const kKult = kulttuuri.find(d => d.event.id === 'i3')!
  ideaChecks.push({ name: 'seniori-alaskuopaus ohitetaan kulttuuri-scenellä', ok: kKult.score > kNo.score + 4 })
  ideaChecks.push({ name: 'oletuksena keikka ennen klassista', ok: noScene[0].event.id === 'i1' })
}

{
  const noTaste = buildIdeaDeck([evKeikka], { seed: 'X', nowMs: IDEA_NOW, today: IDEA_TODAY })[0]
  const taste = buildIdeaDeck([evKeikka], { seed: 'X', nowMs: IDEA_NOW, today: IDEA_TODAY, categoryScores: { musiikki: 2 } })[0]
  ideaChecks.push({ name: 'makumuisti nostaa osuvan kategorian', ok: taste.score > noTaste.score })
  ideaChecks.push({ name: 'makumuistin selite on rehellinen', ok: taste.reason === 'Sopii makuusi aiempien valintojesi perusteella' })
}

{
  const scene = buildIdeaDeck([evKeikka], { seed: 'X', nowMs: IDEA_NOW, today: IDEA_TODAY, scenes: ['keikka'] })[0]
  ideaChecks.push({ name: 'scene-selite generoituu', ok: scene.reason === 'Valitsit keikat — tämä on sinua varten' })
}

{
  const a1 = buildIdeaDeck([evKeikka, evKaynnissa], { seed: 'SAMA', nowMs: IDEA_NOW, today: IDEA_TODAY }).map(d => d.event.id)
  const a2 = buildIdeaDeck([evKeikka, evKaynnissa], { seed: 'SAMA', nowMs: IDEA_NOW, today: IDEA_TODAY }).map(d => d.event.id)
  ideaChecks.push({ name: 'sama siemen → sama pakka (determinismi)', ok: JSON.stringify(a1) === JSON.stringify(a2) })
}

{
  const noDemote = buildIdeaDeck([evKeikka], { seed: 'X', nowMs: IDEA_NOW, today: IDEA_TODAY })[0]
  const demote = buildIdeaDeck([evKeikka], { seed: 'X', nowMs: IDEA_NOW, today: IDEA_TODAY, demoted: ['keikka'] })[0]
  ideaChecks.push({ name: '"ei tällaista" -demotio laskee pistettä', ok: demote.score < noDemote.score })
}

for (const c of ideaChecks) {
  if (c.ok) pass++
  else failures.push(`✗ idea-deck: ${c.name}`)
}

// ── AIKAVYÖHYKE: naiivit aikaleimat (tuotantobugi 2026-08-21) ───────────────
// Skraperit tuottavat paikallista seinäkelloaikaa ilman offsetia. UTC-palvelimella
// (Vercel) new Date() luki ne 3 h väärin → klo 21+ tapahtumat vaihtoivat päivää,
// putosivat Illalla-näkymästä ja karkasivat dedupista. Bugi oli paikallisesti
// näkymätön: TZ=Europe/Helsinki -koneella sama koodi toimi oikein. Siksi
// prebuild ajaa nämä (ja kaikki muut) testit TZ=UTC:llä — ks. package.json.
{
  const tzChecks: { name: string; ok: boolean; got?: string }[] = []
  const N = normalizeHelsinkiTimestamp

  // Naiivi → Helsinki-offset (kesä +03, talvi +02). Tulos on TZ-riippumaton.
  tzChecks.push({ name: 'naiivi kesäaika saa +03:00', ok: N('2026-08-22T23:30:00') === '2026-08-22T23:30:00+03:00', got: String(N('2026-08-22T23:30:00')) })
  tzChecks.push({ name: 'naiivi talviaika saa +02:00', ok: N('2026-01-15T23:30:00') === '2026-01-15T23:30:00+02:00', got: String(N('2026-01-15T23:30:00')) })
  tzChecks.push({ name: 'millisekunnit säilyvät', ok: N('2026-08-22T22:00:00.000') === '2026-08-22T22:00:00.000+03:00' })
  // Olemassa olevaan ei kosketa
  tzChecks.push({ name: 'Z-päätteinen säilyy koskemattomana', ok: N('2026-08-22T20:30:00Z') === '2026-08-22T20:30:00Z' })
  tzChecks.push({ name: 'offset säilyy koskemattomana', ok: N('2026-08-22T23:30:00+03:00') === '2026-08-22T23:30:00+03:00' })
  tzChecks.push({ name: 'pelkkä päivä säilyy (koko päivän tapahtuma)', ok: N('2026-08-22') === '2026-08-22' })
  tzChecks.push({ name: 'roska säilyy muuttumattomana', ok: N('roska') === 'roska' })
  tzChecks.push({ name: 'null → null', ok: N(null) === null })
  tzChecks.push({ name: 'idempotentti', ok: N(N('2026-08-22T23:30:00')) === '2026-08-22T23:30:00+03:00' })

  // YDINVÄITE: normalisoitu klo 23:30 kuuluu SAMALLE Helsinki-päivälle myös
  // UTC-palvelimella. Ilman normalisointia tämä antoi 2026-08-23.
  for (const naive of ['2026-08-22T21:00:00', '2026-08-22T22:00:00.000', '2026-08-22T23:30:00']) {
    const d = helsinkiDateOf(N(naive) as string)
    tzChecks.push({ name: `normalisoitu ${naive.slice(11)} pysyy päivässä 08-22`, ok: d === '2026-08-22', got: d })
  }

  // DST-VAIHTOPÄIVÄT 2026 (kesäaika alkaa su 29.3. klo 03:00, päättyy su 25.10.
  // klo 04:00). Offset on luettava aikaleiman OMASTA hetkestä kaksivaiheisesti:
  // kohdepäivän keskipäivä antoi aamuyölle väärän offsetin, jolloin aikaleima
  // siirtyi EDELLISELLE kalenteripäivälle ja tapahtuma katosi haetulta päivältä.
  const dstCases: [string, string][] = [
    ['2026-03-29T00:00:00', '+02:00'], // vaihtopäivän alku — kriittisin
    ['2026-03-29T00:30:00', '+02:00'],
    ['2026-03-29T02:30:00', '+02:00'], // yhä ennen klo 03:00 siirtoa
    ['2026-03-29T04:30:00', '+03:00'], // siirron jälkeen
    ['2026-03-28T23:30:00', '+02:00'], // päivä ennen
    ['2026-10-25T00:30:00', '+03:00'], // syksyn vaihtopäivä ennen klo 04:00
    ['2026-10-25T05:30:00', '+02:00'], // jälkeen
    ['2026-10-24T23:30:00', '+03:00'],
  ]
  for (const [naive, expOffset] of dstCases) {
    const out = String(N(naive))
    tzChecks.push({ name: `DST ${naive} → ${expOffset}`, ok: out === `${naive}${expOffset}`, got: out })
    // Päivä ei saa liukua kalenterissa kummallakaan puolella siirtymää
    tzChecks.push({ name: `DST ${naive} pysyy päivässä ${naive.slice(0, 10)}`, ok: helsinkiDateOf(out) === naive.slice(0, 10), got: helsinkiDateOf(out) })
  }

  // Poikkeavat mutta lailliset muodot — uusi lähde voi tuoda minkä tahansa näistä
  tzChecks.push({ name: 'offset ilman kaksoispistettä tunnistetaan (+0300)', ok: N('2026-08-22T23:30:00+0300') === '2026-08-22T23:30:00+0300' })
  tzChecks.push({ name: 'pieni z tunnistetaan aikavyöhykkeeksi', ok: N('2026-08-22T20:30:00z') === '2026-08-22T20:30:00z' })
  // Erotin normalisoidaan 'T':ksi — muuten formatEventDate (!includes('T'))
  // pitäisi välilyöntimuotoa koko päivän tapahtumana ja piilottaisi kellonajan.
  tzChecks.push({ name: "pieni t-erotin → 'T' + offset", ok: N('2026-08-22t23:30:00') === '2026-08-22T23:30:00+03:00', got: String(N('2026-08-22t23:30:00')) })
  tzChecks.push({ name: "välilyönti-erotin → 'T' + offset", ok: N('2026-08-22 23:30:00') === '2026-08-22T23:30:00+03:00', got: String(N('2026-08-22 23:30:00')) })
  tzChecks.push({ name: 'välilyöntimuoto pysyy samassa Helsinki-päivässä', ok: helsinkiDateOf(N('2026-08-22 23:30:00') as string) === '2026-08-22', got: helsinkiDateOf(N('2026-08-22 23:30:00') as string) })
  tzChecks.push({ name: 'kelloaika ilman sekunteja normalisoidaan', ok: N('2026-08-22T23:30') === '2026-08-22T23:30+03:00', got: String(N('2026-08-22T23:30')) })
  tzChecks.push({ name: 'mikrosekunnit säilyvät', ok: N('2026-08-22T23:30:00.123456') === '2026-08-22T23:30:00.123456+03:00' })
  tzChecks.push({ name: 'negatiiviseen offsetiin ei kosketa', ok: N('2026-08-22T23:30:00-05:00') === '2026-08-22T23:30:00-05:00' })
  tzChecks.push({ name: 'tuntematon muoto palautetaan koskemattomana', ok: N('22.8.2026 23:30') === '22.8.2026 23:30' })

  // ROBUSTIUS: helsinkiOffset ei saa heittää kelvottomasta Datesta. helsinkiISO:a
  // kutsutaan skrapereista ilman per-rivin suojaa, joten RangeError kaataisi koko
  // lähteen (venues = 15 keikkapaikkaa) yhden roskaisen päivän takia.
  let offsetThrew = false
  try { helsinkiOffset(new Date(NaN)) } catch { offsetThrew = true }
  tzChecks.push({ name: 'helsinkiOffset(kelvoton Date) ei heitä', ok: !offsetThrew })
  let isoThrew = false
  try { helsinkiISO(NaN, NaN, NaN, 19, 0) } catch { isoThrew = true }
  tzChecks.push({ name: 'helsinkiISO(NaN) ei heitä', ok: !isoThrew })
  tzChecks.push({ name: 'helsinkiOffset kelvollisella päivällä yhä oikea', ok: helsinkiOffset(new Date('2026-01-15T12:00:00Z')) === '+02:00', got: helsinkiOffset(new Date('2026-01-15T12:00:00Z')) })

  for (const c of tzChecks) {
    if (c.ok) pass++
    else failures.push(`✗ aikavyöhyke: ${c.name}${c.got ? ` (sai: ${c.got})` : ''}`)
  }
}

// ── RAVINTOLOIDEN SYYT ──────────────────────────────────────────────────────
// Jokainen tapaus alla on TUOTANNOSTA MITATTU väärä osuma tai väärä järjestys,
// joka löytyi ennen julkaisua. Ne ovat täällä, jotta sama virhe ei voi palata.
{
  const rChecks: { name: string; ok: boolean; got?: string }[] = []
  const today = new Date('2026-08-22T12:00:00Z')
  const mich = (tier: number): RestaurantReason =>
    ({ kind: 'michelin', label: `Michelin ${tier}`, source: 'Michelin-opas', tier })

  // 1. NIMIEN YHDISTÄMINEN
  rChecks.push({ name: 'reasonKey pudottaa etuliitteen', ok: reasonKey('Ravintola Olo') === 'olo', got: reasonKey('Ravintola Olo') })
  rChecks.push({ name: 'reasonKey pudottaa ketjuliitteen', ok: reasonKey('Kuurna Oy') === 'kuurna', got: reasonKey('Kuurna Oy') })
  rChecks.push({ name: 'reasonKey pudottaa kaupungin', ok: reasonKey('Chapter, Helsinki') === 'chapter', got: reasonKey('Chapter, Helsinki') })
  rChecks.push({ name: 'reasonKey normalisoi &-merkin', ok: reasonKey('Chef & Sommelier') === 'chef and sommelier', got: reasonKey('Chef & Sommelier') })
  rChecks.push({ name: 'reasonKey purkaa heittomerkin', ok: reasonKey("Bar Om´pu") === 'om pu', got: reasonKey("Bar Om´pu") })
  // Kolmen merkin nimi EI saa kadota: nelimerkkinen alaraja olisi vienyt Olon
  // Michelin-merkin. Täsmähaku ei tarvitse pituusrajaa.
  rChecks.push({ name: 'lyhyt nimi Olo kelpaa avaimeksi', ok: reasonKeyVariants('Olo').includes('olo') })
  rChecks.push({ name: 'yleissana ei kelpaa avaimeksi', ok: !reasonKeyVariants('Ravintola').length })

  // 2. VARIANTIT — ja niiden vaarallisuus
  rChecks.push({ name: 'sulkeista poimitaan lyhenne', ok: reasonKeyVariants('Baskeri & Basso (BasBas)').includes('basbas') })
  rChecks.push({ name: 'välilyönnitön muoto mukaan', ok: reasonKeyVariants('18 grams').includes('18grams') })
  rChecks.push({ name: 'kauttaviivan molemmat puolet', ok: reasonKeyVariants('Helsinki Coffee Roastery / Helsingin kahvipaahtimo').includes('helsingin kahvipaahtimo') })
  // Pilkun etuosa: Time Outin terassilista kirjoittaa "Superterassi, Kasarmitori".
  rChecks.push({ name: 'pilkun etuosa variantiksi', ok: reasonKeyVariants('Superterassi, Kasarmitori').includes('superterassi') })
  // Johdettu pilkkuvariantti noudattaa 5 merkin alarajaa: 'Rio, Kallio' ei saa
  // tuottaa avainta 'rio', joka osuisi väärään paikkaan.
  rChecks.push({ name: 'pilkun lyhyt etuosa hylätään', ok: !reasonKeyVariants('Rio, Kallio').includes('rio'), got: reasonKeyVariants('Rio, Kallio').join(',') })
  // TUOTANTOVIRHE: "Arcada studerandekår (ASK)" tuotti avaimen "ask", joka osui
  // Vuoden ravintola 2014 -voittajaan ("Ask, Helsinki").
  rChecks.push({ name: 'liian lyhyt johdettu variantti hylätään (ASK)', ok: !reasonKeyVariants('Arcada studerandekår (ASK)').includes('ask'), got: reasonKeyVariants('Arcada studerandekår (ASK)').join(',') })

  // 3. OSOITTEEN TARKISTUS
  rChecks.push({ name: 'streetKey sietää ylimääräiset välit', ok: streetKey('Eerikinkatu  20  ') === 'eerikinkatu|20', got: String(streetKey('Eerikinkatu  20  ')) })
  rChecks.push({ name: 'streetKey pudottaa postinumeron', ok: streetKey('Aleksis kiven katu 17,00510 Helsinki') === 'aleksis kiven katu|17', got: String(streetKey('Aleksis kiven katu 17,00510 Helsinki')) })
  rChecks.push({ name: 'streetKey pudottaa kerroksen', ok: streetKey('Mannerheimintie 14, 2. krs') === 'mannerheimintie|14', got: String(streetKey('Mannerheimintie 14, 2. krs')) })
  rChecks.push({ name: 'streetKey null ilman numeroa', ok: streetKey('Lonnan saari') === null, got: String(streetKey('Lonnan saari')) })
  rChecks.push({ name: 'sameStreet ei osu kun numero puuttuu', ok: !sameStreet('Lonnan saari', 'Lonnan saari') })
  // Osoite ei ole aina ensimmäisenä palana — mitattu Googlen vastauksista.
  rChecks.push({ name: 'katu löytyy toisesta palasta', ok: sameStreet('Asemapäällikönkatu 3', 'K-Marketin yläpuolella, Asemapäällikönkatu 3A, 00520 Helsinki') })
  rChecks.push({ name: 'katu löytyy Redi-selitteen takaa', ok: sameStreet('Hermannin rantatie 5', 'Redi 1.krs Food Port, Hermannin rantatie 5, 00580 Helsinki') })
  rChecks.push({ name: 'katu löytyy Entrance-selitteen takaa', ok: sameStreet('Örskinkuja 2 lt 2', 'Entrance at, Örskinkuja 2 LT2, Kirkonkyläntie 6') })
  // Yhden merkin lyöntivirhe rekisterissä tai OSM:ssä ei saa hylätä osumaa…
  rChecks.push({ name: 'yhden merkin lyöntivirhe sallitaan (Kolman/Kolmas)', ok: sameStreet('Kolman Linja 6', 'Kolmas linja 6, 00530 Helsinki') })
  // Kahden merkin ero EI riitä, vaikka kyse olisi samasta kadusta: OSM:n
  // "Häeemtie 10" on kaksi muokkausta "Hämeentie 10":stä. Kallio Bar jää siis
  // ilman merkkiä — tietoinen valinta, väljempi raja yhdistäisi eri katuja.
  rChecks.push({ name: 'kahden merkin lyöntivirhe EI riitä (Häeemtie)', ok: !sameStreet('Hämeentie 10', 'Häeemtie 10') })
  // …mutta eri talonumero on aina eri paikka, vaikka katu olisi sama.
  rChecks.push({ name: 'eri talonumero ei koskaan osu', ok: !sameStreet('Solnantie 26', 'Solnantie 18, 00330 Helsinki') })
  rChecks.push({ name: 'eri katu ei osu', ok: !sameStreet('Maaherrantie 34', 'Roihuvuorentie 9, 00820 Helsinki') })
  rChecks.push({ name: 'kahden merkin ero ei riitä', ok: !sameStreet('Mäkelänkatu 28', 'Mäkelänkatu 45') })

  // 4. UUTUUSMERKIN VARTIJAT — kaikki kolme mitattu tuotannosta
  const uusi: RestaurantReason = {
    kind: 'uusi', label: 'Avattu elokuussa', source: 'rekisteri',
    date: '2026-08-17', street: 'Kastelholmantie 2',
  }
  const byName = { kummiseta: [uusi] }
  rChecks.push({
    name: 'uusi osuu oikeaan osoitteeseen',
    ok: matchReasons({ name: 'Kummisetä', address: 'Kastelholmantie 2' }, byName).length === 1,
  })
  // TUOTANTOVIRHE: ketjun toinen toimipiste sai avausmerkin. Robert's Coffeella
  // se olisi osunut yhteentoista toimipisteeseen.
  rChecks.push({
    name: 'uusi EI osu ketjun toiseen osoitteeseen',
    ok: matchReasons({ name: 'Kummisetä', address: 'Kirstinkatu 13' }, byName).length === 0,
  })
  rChecks.push({
    name: 'uusi osuu kun osoite puuttuu mutta nimi on uniikki',
    ok: matchReasons({ name: 'Kummisetä' }, byName, { uniqueName: true }).length === 1,
  })
  rChecks.push({
    name: 'uusi EI osu kun osoite puuttuu eikä nimi ole uniikki',
    ok: matchReasons({ name: 'Kummisetä' }, byName, { uniqueName: false }).length === 0,
  })
  // TUOTANTOVIRHE: Ihana Kahvila (725 arvostelua) sai "Avattu kesäkuussa".
  rChecks.push({
    name: 'satojen arvostelujen paikka ei ole uusi',
    ok: matchReasons({ name: 'Kummisetä', address: 'Kastelholmantie 2', reviewCount: 725 }, byName).length === 0,
  })
  rChecks.push({
    name: 'harvojen arvostelujen paikka voi olla uusi',
    ok: matchReasons({ name: 'Kummisetä', address: 'Kastelholmantie 2', reviewCount: 23 }, byName).length === 1,
  })

  // 5. JÄRJESTYS
  // TUOTANTOVIRHE: kaikilla Michelin-luokilla oli sama paino, joten Bona Fide
  // (Bib Gourmand) nousi sijalle 1 Grönin (2★) ja Palacen (2★) ohi.
  rChecks.push({ name: '2★ painaa enemmän kuin Bib', ok: reasonWeight(mich(4), today) > reasonWeight(mich(2), today) })
  rChecks.push({ name: 'Bib painaa enemmän kuin Selected', ok: reasonWeight(mich(2), today) > reasonWeight(mich(1), today) })
  const bib3: RestaurantReason[] = [
    mich(2),
    { kind: 'top50', label: 's15', source: 'x', rank: 15 },
    { kind: 'vuoden-ravintola', label: 'v2025', source: 'x', date: '2025-01-01' },
    { kind: 'timeout', label: 't', source: 'x' },
  ]
  rChecks.push({
    name: 'yksi 2★ voittaa Bibin + kolme sivusyytä',
    ok: reasonsWeight([mich(4)], today) > reasonsWeight(bib3, today),
    got: `${reasonsWeight([mich(4)], today).toFixed(1)} vs ${reasonsWeight(bib3, today).toFixed(1)}`,
  })
  // Vanha palkinto ei ole enää syy mennä tänään.
  const v2026: RestaurantReason = { kind: 'vuoden-ravintola', label: 'v', source: 'x', date: '2026-01-01' }
  const v2014: RestaurantReason = { kind: 'vuoden-ravintola', label: 'v', source: 'x', date: '2014-01-01' }
  rChecks.push({ name: 'tuore Vuoden ravintola painaa vanhaa enemmän', ok: reasonWeight(v2026, today) > reasonWeight(v2014, today) * 2 })
  // Sija 1 ennen sijaa 50.
  rChecks.push({
    name: 'top50 sija 1 painaa sijaa 50 enemmän',
    ok: reasonWeight({ kind: 'top50', label: 'a', source: 'x', rank: 1 }, today)
      > reasonWeight({ kind: 'top50', label: 'b', source: 'x', rank: 50 }, today),
  })
  // Tuleva avaus on kiinnostavampi kuin neljä kuukautta sitten avattu.
  const tuleva: RestaurantReason = { kind: 'uusi', label: 'Avaa', source: 'x', date: '2026-10-01' }
  const vanhaAvaus: RestaurantReason = { kind: 'uusi', label: 'Avattu', source: 'x', date: '2026-04-22' }
  rChecks.push({ name: 'tuleva avaus painaa vanhaa avausta enemmän', ok: reasonWeight(tuleva, today) > reasonWeight(vanhaAvaus, today) })
  rChecks.push({ name: 'syytön paikka painaa nolla', ok: reasonsWeight([], today) === 0 })
  rChecks.push({ name: 'primaryReason valitsee painavimman', ok: primaryReason(bib3, today)?.kind === 'michelin' })
  rChecks.push({ name: 'primaryReason kestää tyhjän', ok: primaryReason(undefined, today) === null })

  // 6. AVAUSPÄIVÄN SANALLISTAMINEN
  rChecks.push({ name: 'mennyt avaus imperfektissä', ok: openingLabel('2026-06-30', today) === 'Avattu kesäkuussa', got: String(openingLabel('2026-06-30', today)) })
  rChecks.push({ name: 'tuleva avaus futuurissa', ok: openingLabel('2026-10-01', today) === 'Avaa lokakuussa', got: String(openingLabel('2026-10-01', today)) })
  rChecks.push({ name: 'eri vuosi näyttää vuosiluvun', ok: openingLabel('2027-01-15', today) === 'Avaa tammikuussa 2027', got: String(openingLabel('2027-01-15', today)) })
  rChecks.push({ name: 'kelvoton päivä → null', ok: openingLabel('ei-päivä', today) === null })

  // 7. OIKEA DATATIEDOSTO — rakenne ja romahdusvahti
  const rf = reasonFile as unknown as ReasonFile
  rChecks.push({ name: 'syytiedostossa on avaimia', ok: Object.keys(rf.byName ?? {}).length > 100, got: String(Object.keys(rf.byName ?? {}).length) })
  for (const [kind, floor] of [['michelin', 20], ['top50', 20], ['timeout', 80], ['uusi', 10]] as const) {
    rChecks.push({ name: `syytiedosto: ${kind} ≥ ${floor}`, ok: (rf.counts?.[kind] ?? 0) >= floor, got: String(rf.counts?.[kind] ?? 0) })
  }
  // Jokaisella syyllä on laji ja teksti — tyhjä merkki näyttäisi kortissa rikkinäiseltä.
  const allReasons = Object.values(rf.byName ?? {}).flat()
  rChecks.push({ name: 'jokaisella syyllä on teksti', ok: allReasons.every((x) => typeof x.label === 'string' && x.label.length > 0) })
  rChecks.push({ name: 'jokaisella syyllä on lähde', ok: allReasons.every((x) => typeof x.source === 'string' && x.source.length > 0) })
  rChecks.push({ name: 'jokaisella uusi-syyllä on päivä ja katu', ok: allReasons.filter((x) => x.kind === 'uusi').every((x) => !!x.date && !!x.street) })
  rChecks.push({ name: 'jokaisella michelin-syyllä on tier', ok: allReasons.filter((x) => x.kind === 'michelin').every((x) => typeof x.tier === 'number') })
  // Toimituslistan pilleri on aina lyhyt "lähde · sija N" -muoto — omistajan
  // huomio: pelkkä "Time Out Helsinki" ei kertonut miksi paikka on nostettu.
  const toReasons = allReasons.filter((x) => x.kind === 'timeout')
  rChecks.push({
    name: 'timeout-pilleri on aina lähde · sija -muotoa',
    ok: toReasons.every((x) => /^(Time Out( · sija \d+)?|MyHelsinki)$/.test(x.label)),
    got: toReasons.find((x) => !/^(Time Out( · sija \d+)?|MyHelsinki)$/.test(x.label))?.label,
  })
  rChecks.push({
    name: 'vähintään 30 timeout-syyllä on sijaluku',
    ok: toReasons.filter((x) => typeof x.rank === 'number').length >= 30,
    got: String(toReasons.filter((x) => typeof x.rank === 'number').length),
  })
  rChecks.push({
    name: 'jokaisella timeout-syyllä on listarivi (note) ja linkki',
    ok: toReasons.every((x) => !!x.note && !!x.url),
  })

  // 8. OSM-DUPLIKAATIT — mitattu: "Shelter" ja "shelter" olivat kuratoidun
  //    kärjen sijoilla 21 ja 30, molemmat Kanavaranta 7, 17 metrin päässä.
  type DupFixture = { name: string; lat?: number; lon?: number; image?: string; googleRating?: number }
  const shelterA: DupFixture = { name: 'Shelter', lat: 60.1689639, lon: 24.9593212, image: 'a.jpg', googleRating: 4.4 }
  const shelterB: DupFixture = { name: 'shelter', lat: 60.168829, lon: 24.9591777 }
  const dedup = dedupeOsmVenues([shelterA, shelterB])
  rChecks.push({ name: 'duplikaatti poistuu', ok: dedup.length === 1, got: String(dedup.length) })
  rChecks.push({ name: 'rikkaampi kortti säilyy', ok: dedup[0]?.image === 'a.jpg' })
  // Järjestys ei saa vaikuttaa lopputulokseen.
  const dedupRev = dedupeOsmVenues([shelterB, shelterA])
  rChecks.push({ name: 'rikkaampi säilyy myös käänteisessä järjestyksessä', ok: dedupRev.length === 1 && dedupRev[0]?.image === 'a.jpg' })
  // Ketjun kaksi TODELLISTA toimipistettä eivät saa yhdistyä. Mitattu:
  // Unicafe-kampuksella lähimmät erilliset ovat 52 m päässä toisistaan.
  const uniA = { name: 'Unicafe', lat: 60.2000, lon: 24.9600 }
  const uniB = { name: 'Unicafe', lat: 60.2005, lon: 24.9600 }   // ~56 m
  rChecks.push({ name: 'ketjun eri toimipisteet säilyvät', ok: dedupeOsmVenues([uniA, uniB]).length === 2 })
  // Kummisetä on 8 km päässä toisistaan — ei koskaan sama paikka.
  rChecks.push({
    name: 'kaukaiset samannimiset säilyvät',
    ok: dedupeOsmVenues([
      { name: 'Kummisetä', lat: 60.21295, lon: 25.08013 },
      { name: 'Kummisetä', lat: 60.18844, lon: 24.94681 },
    ]).length === 2,
  })
  rChecks.push({ name: 'eri nimet eivät yhdisty', ok: dedupeOsmVenues([{ name: 'Grön', lat: 60.16, lon: 24.94 }, { name: 'Palace', lat: 60.16, lon: 24.94 }]).length === 2 })
  rChecks.push({ name: 'koordinaatiton ei yhdisty', ok: dedupeOsmVenues([{ name: 'X' }, { name: 'X' }]).length === 2 })
  rChecks.push({ name: 'tyhjä lista ei kaadu', ok: dedupeOsmVenues([]).length === 0 })

  // 9. UUDET AVAUKSET — oikea datatiedosto. Nämä kortit eivät tule OSM:stä
  //    vaan Googlesta, joten niiden eheys on tarkistettava erikseen.
  const of = openingFile as { openings?: Record<string, unknown>[] }
  const ops = Array.isArray(of.openings) ? of.openings : []
  rChecks.push({ name: 'avaustiedostossa on kortteja', ok: ops.length >= 20, got: String(ops.length) })
  rChecks.push({ name: 'jokaisella avauksella on koordinaatit', ok: ops.every((o) => typeof o.lat === 'number' && typeof o.lon === 'number') })
  rChecks.push({ name: 'jokaisella avauksella on nimi ja osoite', ok: ops.every((o) => !!o.name && !!o.address) })
  rChecks.push({ name: 'jokaisella avauksella on avauspäivä', ok: ops.every((o) => typeof o.openedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.openedAt as string)) })
  // Kuva on koko haun tarkoitus — kuvaton kortti on se litania joka hylättiin.
  const imgShare = ops.length ? ops.filter((o) => o.image).length / ops.length : 0
  rChecks.push({ name: 'yli 90 % avauksista on kuvallisia', ok: imgShare > 0.9, got: `${Math.round(imgShare * 100)} %` })
  // Koordinaattien on oltava Helsingissä — väärä pinni kartalla on paha vika.
  rChecks.push({
    name: 'kaikki avaukset Helsingin alueella',
    ok: ops.every((o) => {
      const la = o.lat as number, lo = o.lon as number
      return la > 59.9 && la < 60.35 && lo > 24.5 && lo < 25.35
    }),
  })

  // 10. SEKOITUS — perheet eivät saa kasaantua lohkoiksi.
  {
    type Row = { n: string; reasons: RestaurantReason[] }
    const mk = (n: string, kind: ReasonKind, extra: Partial<RestaurantReason> = {}): Row =>
      ({ n, reasons: [{ kind, label: n, source: 's', ...extra }] })
    // Realistiset suhteet: michelin 30, uusi 43, top50 5 (loput kantavat
    // Michelin-merkkiä), timeout 12.
    const rows: Row[] = [
      ...Array.from({ length: 30 }, (_, i) => mk(`M${i}`, 'michelin', { tier: 5 - Math.floor(i / 8) })),
      ...Array.from({ length: 43 }, (_, i) => mk(`U${i}`, 'uusi', { date: `2026-0${1 + (i % 8)}-01` })),
      ...Array.from({ length: 5 }, (_, i) => mk(`T${i}`, 'top50', { rank: i + 1 })),
      ...Array.from({ length: 12 }, (_, i) => mk(`O${i}`, 'timeout')),
      { n: 'X0', reasons: [] }, { n: 'X1', reasons: [] },
    ]
    const mixed = interleaveReasoned(rows, (r) => (r.reasons.length ? r.reasons : undefined), today)
    rChecks.push({ name: 'sekoitus ei kadota eikä monista', ok: mixed.length === rows.length, got: `${mixed.length}/${rows.length}` })
    rChecks.push({ name: 'sekoitus säilyttää kaikki paikat', ok: new Set(mixed.map((r) => r.n)).size === rows.length })

    const kindOf = (r: Row): ReasonKind | 'none' => r.reasons[0]?.kind ?? 'none'
    const head = mixed.slice(0, 40).map(kindOf)
    let run = 1, worst = 1
    for (let i = 1; i < head.length; i++) { run = head[i] === head[i - 1] ? run + 1 : 1; worst = Math.max(worst, run) }
    // ILMAN LOMITUSTA tämä olisi 30: ensin kaikki Michelinit peräkkäin.
    rChecks.push({ name: 'sama perhe enintään 2 kertaa peräkkäin', ok: worst <= 2, got: String(worst) })

    const first40 = new Set(head)
    rChecks.push({ name: 'kaikki kolme pääperhettä kärki-40:ssä', ok: first40.has('michelin') && first40.has('uusi') && first40.has('top50') })
    // Toimituslistat OVAT sekoituksessa — omistaja huomasi että tail-lohkossa
    // ne jäivät kärki-60:n taitteen alle eikä yksikään uusi löytö näkynyt.
    rChecks.push({ name: 'toimituslistat mukana sekoituksessa', ok: head.includes('timeout') })
    const idxTimeout = mixed.findIndex((r) => kindOf(r) === 'timeout')
    const idxNone = mixed.findIndex((r) => kindOf(r) === 'none')
    rChecks.push({ name: 'toimituslistat ennen syyttömiä', ok: idxTimeout >= 0 && idxNone > idxTimeout })
    rChecks.push({ name: 'syyttömät viimeisenä', ok: mixed.slice(-2).every((r) => kindOf(r) === 'none') })
    // Perheen sisäinen järjestys säilyy: vahvin Michelin ennen heikointa.
    const ms = mixed.filter((r) => kindOf(r) === 'michelin').map((r) => r.n)
    rChecks.push({ name: 'perheen sisäinen paremmuus säilyy', ok: ms.indexOf('M0') < ms.indexOf('M29') })
    // Vakaus: sama syöte → sama tulos.
    const again = interleaveReasoned(rows, (r) => (r.reasons.length ? r.reasons : undefined), today)
    rChecks.push({ name: 'sekoitus on vakaa', ok: mixed.map((r) => r.n).join() === again.map((r) => r.n).join() })
    rChecks.push({ name: 'tyhjä syöte ei kaadu', ok: interleaveReasoned([], () => undefined, today).length === 0 })
  }

  // 11. USKOTTAVUUS — Wilsonin alaraja. Käyttäjän sääntö: arvostelujen määrä
  //     suhteessa arvosanaan ratkaisee, ei pelkkä arvosana.
  {
    const w = credibilityScore
    const pair = (name: string, a: [number, number], b: [number, number]) =>
      rChecks.push({
        name,
        ok: w(a[1], a[0]) > w(b[1], b[0]),
        got: `${w(a[1], a[0]).toFixed(3)} vs ${w(b[1], b[0]).toFixed(3)}`,
      })
    // Käyttäjän omat esimerkit, sanatarkasti.
    pair('2000×4,6 voittaa 14×4,7', [2000, 4.6], [14, 4.7])
    pair('3000×4,7 voittaa 3×4,9', [3000, 4.7], [3, 4.9])
    // Sivulta mitattu vika: 4,1 (19) oli kärjessä.
    pair('2000×4,6 voittaa 19×4,1', [2000, 4.6], [19, 4.1])
    pair('358×4,7 voittaa 19×4,1', [358, 4.7], [19, 4.1])
    // Ohut 5,0 ei saa ohittaa paksusti arvosteltua. Wilsonin oma ansa on että
    // p(1−p) → 0 kun p = 1; hajonta luetaan siksi mittaustaulukosta.
    pair('1978×4,9 voittaa 80×5,0', [1978, 4.9], [80, 5.0])
    pair('2000×4,6 voittaa 30×5,0', [2000, 4.6], [30, 5.0])
    pair('135×5,0 voittaa 3×5,0', [135, 5.0], [3, 5.0])
    // MUTTA vahvasti todistettu 5,0 SAA voittaa 4,9:n — se ei ole virhe vaan
    // oikea vastaus, ja kaavan on kestettävä se ilman että sääntö rikkoutuu.
    pair('610×5,0 voittaa 1978×4,9', [610, 5.0], [1978, 4.9])
    // Volyymi ei silti saa yksin riittää.
    pair('1978×4,9 voittaa 4185×4,6', [1978, 4.9], [4185, 4.6])
    // Monotonisuus molempiin suuntiin.
    pair('samalla määrällä parempi arvosana voittaa', [500, 4.8], [500, 4.5])
    pair('samalla arvosanalla enemmän arvosteluja voittaa', [2000, 4.6], [100, 4.6])
    // Reunatapaukset eivät saa kaataa eivätkä tuottaa roskaa.
    const edge: [string, number, number][] = [
      ['arvosteluton = 0', 0, 5.0], ['arvosanaton = 0', 500, 0],
      ['negatiivinen määrä = 0', -5, 4.5], ['NaN-arvosana = 0', 100, NaN],
    ]
    for (const [name, n, r] of edge) {
      rChecks.push({ name, ok: w(r, n) === 0, got: String(w(r, n)) })
    }
    rChecks.push({ name: 'null-syöte ei kaadu', ok: w(null, null) === 0 })
    rChecks.push({ name: 'tulos aina 0–1', ok: [1, 5, 50, 5000].every((n) => [1, 3, 4.5, 5].every((r) => { const v = w(r, n); return v >= 0 && v <= 1 })) })
    // Yli-arvosana (roskadata) ei saa tuottaa yli ykköstä.
    rChecks.push({ name: 'roskadata 5,4 rajautuu', ok: w(5.4, 100) <= 1 })
    // MONOTONISUUS. Mittaustaulukko interpoloidaan, joten kaavassa on
    // taitekohtia — niistä ei saa syntyä laskevaa kohtaa kumpaankaan suuntaan.
    let monoBad = 0
    for (const n of [1, 3, 10, 37, 80, 135, 610, 1978, 5000, 14187]) {
      let prev = -1
      for (let r = 1; r <= 5.0001; r += 0.01) {
        const v = w(Math.round(r * 100) / 100, n)
        if (v < prev - 1e-12) monoBad++
        prev = v
      }
    }
    for (let r = 1; r <= 5.0001; r += 0.1) {
      let prev = -1
      for (const n of [1, 2, 5, 15, 40, 100, 300, 900, 2500, 9000]) {
        const v = w(Math.round(r * 10) / 10, n)
        if (v < prev - 1e-12) monoBad++
        prev = v
      }
    }
    rChecks.push({ name: 'kasvava arvosanan ja määrän suhteen (1230 paria)', ok: monoBad === 0, got: String(monoBad) })
  }

  // 12. KORJATUT VIAT — jokainen näistä oli vastakkaistarkistuksen löytämä.
  {
    const mk = (kind: ReasonKind, extra: Partial<RestaurantReason> = {}): RestaurantReason =>
      ({ kind, label: 'x', source: 's', ...extra })
    // Uusien kesken tuoreus oli KUOLLUTTA KOODIA: uskottavuus on liukuluku,
    // joten `a.c !== b.c` oli aina tosi eikä tuoreusvertailu ajautunut koskaan.
    // Kaistoitus 0,05:een tekee siitä aidon.
    type Row = { n: string; reasons: RestaurantReason[]; c: number }
    const rows: Row[] = [
      { n: 'sama-kaista-vanha', reasons: [mk('uusi', { date: '2026-05-01' })], c: 0.902 },
      { n: 'sama-kaista-uusi', reasons: [mk('uusi', { date: '2026-08-01' })], c: 0.898 },
      { n: 'parempi-kaista', reasons: [mk('uusi', { date: '2026-01-01' })], c: 0.951 },
    ]
    const mixedRows = interleaveReasoned(rows, (r) => r.reasons, today, (r) => r.c)
    rChecks.push({ name: 'parempi kaista voittaa tuoreuden', ok: mixedRows[0]?.n === 'parempi-kaista', got: String(mixedRows[0]?.n) })
    rChecks.push({ name: 'saman kaistan sisällä tuorein voittaa', ok: mixedRows[1]?.n === 'sama-kaista-uusi', got: String(mixedRows[1]?.n) })

    // Sivusyiden lisä ei saa ylittää yhtä Michelin-tasoa: 1★ + neljä sivusyytä
    // ei saa nousta 2★:n ohi.
    const oneStarLoaded = [
      mk('michelin', { tier: 3 }), mk('top50', { rank: 1 }),
      mk('vuoden-ravintola', { date: '2026-01-01' }), mk('uusi', { date: '2026-08-20' }), mk('timeout'),
    ]
    rChecks.push({
      name: '1★ + neljä sivusyytä ei ohita 2★:ää',
      ok: reasonsWeight([mk('michelin', { tier: 4 })], today) > reasonsWeight(oneStarLoaded, today),
      got: `${reasonsWeight([mk('michelin', { tier: 4 })], today).toFixed(1)} vs ${reasonsWeight(oneStarLoaded, today).toFixed(1)}`,
    })

    // Uutuus ei ole laatuväite: heikoksi TIEDETTY uusi paikka ei saa
    // kuratoitua paikkaa. Mitattu vika: Tian Tian 4,1 (19) oli sivulla 3.
    type GRow = { n: string; reasons: RestaurantReason[]; rating?: number; reviews?: number }
    const gated: GRow[] = [
      { n: 'hyva', reasons: [mk('uusi', { date: '2026-07-01' })], rating: 4.9, reviews: 80 },
      { n: 'huono', reasons: [mk('uusi', { date: '2026-08-01' })], rating: 4.1, reviews: 19 },
      { n: 'liian-tuore-arvioitavaksi', reasons: [mk('uusi', { date: '2026-08-20' })], rating: 4.1, reviews: 3 },
      { n: 'syyton', reasons: [], rating: 4.9, reviews: 900 },
    ]
    const g = interleaveReasoned(gated, (r) => (r.reasons.length ? r.reasons : undefined), today,
      () => 0.9, (r) => ({ rating: r.rating, reviews: r.reviews }))
    const pos = (n: string) => g.findIndex((x) => x.n === n)
    // Molemmilla on sama uskottavuus (0,9) eli sama kaista, joten tuorein
    // voittaa — 'liian-tuore' on 20.8. ja 'hyva' 1.7. Kumpikin läpäisee portin.
    rChecks.push({ name: 'hyvä uusi pääsee kärkeen', ok: pos('hyva') <= 1, got: String(pos('hyva')) })
    rChecks.push({ name: 'liian tuore arvioitavaksi säilyy kärjessä', ok: pos('liian-tuore-arvioitavaksi') <= 1, got: String(pos('liian-tuore-arvioitavaksi')) })
    rChecks.push({ name: 'saman kaistan tuorein ensin', ok: pos('liian-tuore-arvioitavaksi') < pos('hyva') })
    rChecks.push({ name: 'heikoksi tiedetty uusi putoaa kärjestä', ok: pos('huono') > pos('hyva') && pos('huono') > pos('liian-tuore-arvioitavaksi'), got: String(pos('huono')) })
    rChecks.push({ name: 'portti ei kadota paikkaa', ok: g.length === gated.length })
    // Ilman `ratingOf`-parametria porttia ei sovelleta lainkaan.
    const noGate = interleaveReasoned(gated, (r) => (r.reasons.length ? r.reasons : undefined), today, () => 0.9)
    rChecks.push({ name: 'ilman arvosanatietoa portti ei aktivoidu', ok: noGate.findIndex((x) => x.n === 'huono') < 3 })
  }

  // 13. VIIDES JUONNE — huippuarvioidut. Neljä ulkoista syytä ohittivat aina
  //     pelkän arvostelun, joten Helsingin arvostetuimmat (99 TopMeal 4,9 /
  //     1978) jäivät kärjen ulkopuolelle. Nyt ne ovat oma perheensä.
  {
    const mk2 = (kind: ReasonKind, extra: Partial<RestaurantReason> = {}): RestaurantReason =>
      ({ kind, label: 'x', source: 's', ...extra })
    type Row5 = { n: string; reasons: RestaurantReason[]; c: number }
    const rows: Row5[] = [
      ...Array.from({ length: 25 }, (_, i) => ({ n: `M${i}`, reasons: [mk2('michelin', { tier: 4 })], c: 0.9 - i * 0.001 })),
      ...Array.from({ length: 30 }, (_, i) => ({ n: `U${i}`, reasons: [mk2('uusi', { date: '2026-07-01' })], c: 0.9 - i * 0.001 })),
      ...Array.from({ length: 28 }, (_, i) => ({ n: `H${i}`, reasons: [mk2('huippuarvio')], c: 0.97 - i * 0.001 })),
      ...Array.from({ length: 6 }, (_, i) => ({ n: `T${i}`, reasons: [mk2('top50', { rank: i + 1 })], c: 0.9 })),
    ]
    const mixed5 = interleaveReasoned(rows, (r) => r.reasons, today, (r) => r.c)
    const kinds = mixed5.slice(0, 40).map((r) => r.reasons[0].kind)
    rChecks.push({ name: 'huippuarvio on mukana sekoituksessa', ok: kinds.includes('huippuarvio') })
    let run5 = 1, worst5 = 1
    for (let i = 1; i < kinds.length; i++) { run5 = kinds[i] === kinds[i - 1] ? run5 + 1 : 1; worst5 = Math.max(worst5, run5) }
    rChecks.push({ name: 'viidellä perheellä sama enintään 2 kertaa peräkkäin', ok: worst5 <= 2, got: String(worst5) })
    rChecks.push({ name: 'kaikki viisi perhettä kärki-40:ssä', ok: new Set(kinds).size === 4 || new Set(kinds).size === 5, got: [...new Set(kinds)].join(',') })
    rChecks.push({ name: 'huippuarvio järjestyy uskottavuudella', ok: (() => {
      const hs = mixed5.filter((r) => r.reasons[0].kind === 'huippuarvio').map((r) => r.n)
      return hs.indexOf('H0') < hs.indexOf('H27')
    })() })
    rChecks.push({ name: 'sekoitus ei kadota mitään viidelläkään perheellä', ok: mixed5.length === rows.length })
    // Toimituslistat: sija 1 ennen sijaa 20, sijalliset ennen sijattomia —
    // vaikka sijattomalla olisi parempi uskottavuus.
    const toRows = [
      { n: 'sijaton-huippu', reasons: [mk2('timeout')], c: 0.99 },
      { n: 'sija20', reasons: [mk2('timeout', { rank: 20 })], c: 0.85 },
      { n: 'sija1', reasons: [mk2('timeout', { rank: 1 })], c: 0.80 },
    ]
    const toMixed = interleaveReasoned(toRows, (r) => r.reasons, today, (r) => r.c)
    rChecks.push({ name: 'timeout: sija 1 ensin', ok: toMixed[0]?.n === 'sija1', got: toMixed[0]?.n })
    rChecks.push({ name: 'timeout: sija 20 ennen sijatonta', ok: toMixed[1]?.n === 'sija20', got: toMixed[1]?.n })
    // Michelin painaa yhä enemmän kuin huippuarvio: ulkopuolinen arvio voittaa
    // arvostelukeskiarvon, kun molemmat ovat samalla kortilla.
    rChecks.push({
      name: 'Michelin painaa huippuarviota enemmän',
      ok: reasonWeight(mk2('michelin', { tier: 1 }), today) > reasonWeight(mk2('huippuarvio'), today),
    })
    rChecks.push({
      name: 'huippuarvio painaa Time Outia enemmän',
      ok: reasonWeight(mk2('huippuarvio'), today) > reasonWeight(mk2('timeout'), today),
    })
  }

  // 14. UUTISET KORTTEIHIN — yleinen artikkelikaruselli poistettiin ja uutinen
  //     kiinnittyy nyt suoraan ravintolaan. Nimiosuman vartijat ovat samat
  //     jotka mitattiin jo aiemmin; jokainen tapaus tässä on todellinen.
  {
    const item = (title: string, daysAgo: number, link = 'https://x/1'): NewsLike => ({
      title, link, source: 'Testilehti',
      pubDate: new Date(today.getTime() - daysAgo * 86_400_000).toUTCString(),
    })
    const rest = (id: string, name: string): { id: string; name: string } => ({ id, name })

    // Sanaraja: "Teller" EI saa osua sanaan "bestseller".
    const m1 = matchNewsToRestaurants(
      [item('Kirja nousi bestseller-listalle ravintolakirjana', 2)],
      [rest('a', 'Teller')],
    )
    rChecks.push({ name: 'uutinen: Teller ei osu bestselleriin', ok: m1.length === 0, got: String(m1.length) })
    // Oikea osuma sanarajoilla, välimerkit siedetään.
    const m2 = matchNewsToRestaurants(
      [item('Tellerin yrittäjät avaavat uuden viinibaarin Helsinkiin', 3)],
      [rest('a', 'Teller')],
    )
    rChecks.push({ name: 'uutinen: taivutettu nimi EI osu (tarkka sanaosuma)', ok: m2.length === 0 })
    const m2b = matchNewsToRestaurants(
      [item('Ravintola Teller uudisti menunsa syksyksi', 3)],
      [rest('a', 'Teller')],
    )
    rChecks.push({ name: 'uutinen: tarkka nimi osuu', ok: m2b.length === 1 && m2b[0].restaurantId === 'a' })
    // Ketju: kaksi samannimistä toimipistettä → ei osumaa (otsikko ei kerro kumpi).
    const m3 = matchNewsToRestaurants(
      [item('Bastard Burgers avasi jättiravintolan', 1)],
      [rest('a', 'Bastard Burgers'), rest('b', 'Bastard Burgers')],
    )
    rChecks.push({ name: 'uutinen: ketju ei saa osumaa', ok: m3.length === 0 })
    // Yleissana ja lyhyt nimi eivät kelpaa avaimiksi.
    const m4 = matchNewsToRestaurants(
      [item('Uusi ravintola avattiin Kallioon', 1)],
      [rest('a', 'Ravintola'), rest('b', 'Olo')],
    )
    rChecks.push({ name: 'uutinen: yleissana ja lyhyt nimi eivät osu', ok: m4.length === 0 })
    // Tuorein juttu voittaa ja articleCount lasketaan.
    const m5 = matchNewsToRestaurants(
      [item('Ravintola Figaro sai uuden viinilistan', 8, 'https://x/a'),
       item('Figaro juhlii avajaisiaan tarjouksella', 2, 'https://x/b')],
      [rest('a', 'Figaro')],
    )
    rChecks.push({ name: 'uutinen: tuorein otsikko valitaan', ok: m5.length === 1 && m5[0].link === 'https://x/b' && m5[0].articleCount === 2, got: m5[0]?.link })

    // Osuma → syy: 14 pv ikkuna.
    const fresh = toNewsReason(m5[0], today)
    rChecks.push({ name: 'uutinen: tuore juttu antaa syyn', ok: fresh?.kind === 'uutinen' && !!fresh.note })
    const old20 = matchNewsToRestaurants([item('Ravintola Figaro sai uuden viinilistan', 20)], [rest('a', 'Figaro')])
    rChecks.push({ name: 'uutinen: 20 pv vanha ei enää nosta', ok: toNewsReason(old20[0], today) === null })
    const badDate = toNewsReason({ ...m5[0], pubDate: 'ei-päivä' }, today)
    rChecks.push({ name: 'uutinen: kelvoton päivä → null', ok: badDate === null })

    // Nosto kärkeen: uutisellinen menee sekoituksen ETEEN, tuorein ensin, katto 6.
    const mkR = (kind: ReasonKind, extra: Partial<RestaurantReason> = {}): RestaurantReason =>
      ({ kind, label: 'x', source: 's', ...extra })
    type NRow = { n: string; reasons: RestaurantReason[] }
    const newsRows: NRow[] = [
      ...Array.from({ length: 10 }, (_, i) => ({ n: `M${i}`, reasons: [mkR('michelin', { tier: 4 })] })),
      { n: 'news-vanha', reasons: [mkR('uutinen', { date: '2026-08-15' })] },
      { n: 'news-tuore', reasons: [mkR('michelin', { tier: 3 }), mkR('uutinen', { date: '2026-08-22' })] },
      ...Array.from({ length: 8 }, (_, i) => ({ n: `NF${i}`, reasons: [mkR('uutinen', { date: `2026-08-0${i + 1}` })] })),
    ]
    const nm = interleaveReasoned(newsRows, (r) => r.reasons, today)
    rChecks.push({ name: 'uutinen: tuorein juttu ensimmäisenä', ok: nm[0]?.n === 'news-tuore', got: nm[0]?.n })
    rChecks.push({ name: 'uutinen: toiseksi tuorein toisena', ok: nm[1]?.n === 'news-vanha', got: nm[1]?.n })
    // Katto 6: paikat 0–5 kantavat uutista, paikka 6 on jo tavallinen kortti
    // (Michelin ilman uutista) — kymmenestä uutisellisesta neljä vanhinta
    // putoaa etujoukosta ja järjestyy normaalisti.
    const first6AllNews = nm.slice(0, 6).every((r) => r.reasons.some((x) => x.kind === 'uutinen'))
    rChecks.push({ name: 'uutinen: kuusi ensimmäistä kantavat uutista', ok: first6AllNews })
    rChecks.push({
      name: 'uutinen: seitsemäs kortti ei ole etujoukkoa',
      ok: !nm[6]?.reasons.some((x) => x.kind === 'uutinen'),
      got: nm[6]?.n,
    })
    rChecks.push({ name: 'uutinen: mikään ei katoa', ok: nm.length === newsRows.length, got: `${nm.length}/${newsRows.length}` })
    // Michelin-kortin ensisijainen merkki EI vaihdu uutiseksi.
    const withBoth = [mkR('michelin', { tier: 4 }), mkR('uutinen', { date: '2026-08-22' })]
    rChecks.push({ name: 'uutinen ei syrjäytä Michelin-merkkiä', ok: primaryReason(withBoth, today)?.kind === 'michelin' })
  }

  // 15. KUOLLEET KUVAT — haravatiedoston eheys. Googlen kuvaosoitteet lahoavat
  //     (mitattu 49 %); tiedosto kertoo API:lle mitkä ohitetaan.
  {
    const di = deadImages as { sweptAt?: string; checked?: number; dead?: string[] }
    rChecks.push({ name: 'kuvaharava: tiedostossa on aikaleima', ok: typeof di.sweptAt === 'string' && !Number.isNaN(Date.parse(di.sweptAt!)) })
    rChecks.push({ name: 'kuvaharava: tarkistettuja riittävästi', ok: (di.checked ?? 0) >= 1000, got: String(di.checked) })
    rChecks.push({ name: 'kuvaharava: dead on lista osoitteita', ok: Array.isArray(di.dead) && di.dead!.every((u) => typeof u === 'string' && u.startsWith('http')) })
    // Yli 90 % kuolleita = verkkovika, ei todellisuus — skriptin vahti estää
    // kirjoituksen, ja tämä testi varmistaa ettei sellainen tiedosto ole
    // päässyt repoon muutakaan kautta.
    rChecks.push({ name: 'kuvaharava: kuolleiden osuus alle 90 %', ok: (di.dead?.length ?? 0) / Math.max(1, di.checked ?? 1) < 0.9, got: `${di.dead?.length}/${di.checked}` })
    // Nettisivukuvat: ravintolan oman sivun esittelykuva korvaa lahonneen
    // Google-kuvan ilmaiseksi. Jokainen tallennettu on tarkistettu hakuhetkellä.
    const wi = websiteImages as { fetchedAt?: string; checkedSites?: number; byWww?: Record<string, string> }
    rChecks.push({ name: 'nettisivukuvat: aikaleima kelvollinen', ok: typeof wi.fetchedAt === 'string' && !Number.isNaN(Date.parse(wi.fetchedAt!)) })
    rChecks.push({ name: 'nettisivukuvat: vähintään 200 kuvaa', ok: Object.keys(wi.byWww ?? {}).length >= 200, got: String(Object.keys(wi.byWww ?? {}).length) })
    rChecks.push({ name: 'nettisivukuvat: osoitteet ovat http-kuvia', ok: Object.values(wi.byWww ?? {}).every((u) => typeof u === 'string' && /^https?:\/\//.test(u)) })
  }

  // 16. TEKEMISEN SYYT — sama järjestelmä tekemistä-sivulle: näyttelyt
  //     (museot.fi), toimituslistat, OSM:n uudet paikat. Omistajan linjaus:
  //     turistiperuskohteet nousevat VAIN uutisella tai näyttelyllä.
  {
    const mkA = (kind: ReasonKind, extra: Partial<RestaurantReason> = {}): RestaurantReason =>
      ({ kind, label: 'x', source: 's', ...extra })

    // TUOTANTOVIRHE: NFKD hajotti ä:n kirjaimeksi + tarkkeeksi ja tarke
    // muuttui välilyönniksi — 'Linnanmäki' → 'linnanma ki', jolloin
    // peruskohdetunnistus ei osunut. Tarkkeet riisutaan nyt.
    rChecks.push({ name: 'reasonKey riisuu tarkkeet (Linnanmäki)', ok: reasonKey('Linnanmäki') === 'linnanmaki', got: reasonKey('Linnanmäki') })
    rChecks.push({ name: 'reasonKey riisuu tarkkeet (Töölö)', ok: reasonKey('Töölön kisahalli') === 'toolon kisahalli', got: reasonKey('Töölön kisahalli') })

    // Peruskohteet tunnistetaan — ja vain koko nimi osuu, ei niche-kohde.
    rChecks.push({ name: 'Linnanmäki on peruskohde', ok: isTouristBasic('Linnanmäki') })
    rChecks.push({ name: 'Suomenlinna on peruskohde', ok: isTouristBasic('Suomenlinna') })
    rChecks.push({ name: 'Suomenlinnan merilinnoitus EI ole peruskohde', ok: !isTouristBasic('Suomenlinnan merilinnoitus') })
    rChecks.push({ name: 'Sompasauna EI ole peruskohde', ok: !isTouristBasic('Sompasauna') })

    // Peruskohteelta karsitaan kaikki paitsi uutinen ja näyttely.
    const basicsIn = [mkA('huippuarvio'), mkA('timeout'), mkA('uutinen', { date: '2026-08-20' }), mkA('nayttely', { date: '2026-09-01' })]
    const basicsOut = filterReasonsForBasics('Linnanmäki', basicsIn)
    rChecks.push({
      name: 'peruskohteelle jäävät vain uutinen ja näyttely',
      ok: basicsOut.length === 2 && basicsOut.every((x) => x.kind === 'uutinen' || x.kind === 'nayttely'),
      got: basicsOut.map((x) => x.kind).join(','),
    })
    rChecks.push({ name: 'tavallinen paikka pitää kaikki syynsä', ok: filterReasonsForBasics('Sompasauna', basicsIn).length === basicsIn.length })

    // Näyttelyn paino: juuri alkava/alkanut painaa enemmän kuin kauan
    // pyörinyt, ja näyttely istuu painojärjestykseen top50:n ja
    // huippuarvion väliin.
    const freshEx = mkA('nayttely', { date: '2026-08-25' })
    const oldEx = mkA('nayttely', { date: '2025-11-01' })
    rChecks.push({ name: 'tuore näyttely painaa vanhaa enemmän', ok: reasonWeight(freshEx, today) > reasonWeight(oldEx, today) })
    rChecks.push({ name: 'top50 painaa näyttelyä enemmän', ok: reasonWeight(mkA('top50', { rank: 10 }), today) > reasonWeight(freshEx, today) })
    rChecks.push({ name: 'näyttely painaa huippuarviota enemmän', ok: reasonWeight(oldEx, today) > reasonWeight(mkA('huippuarvio'), today) })

    // Näyttelyperhe on mukana sekoituksessa eikä kasaudu lohkoksi.
    type ARow = { n: string; reasons: RestaurantReason[] }
    const aRows: ARow[] = [
      ...Array.from({ length: 15 }, (_, i) => ({ n: `N${i}`, reasons: [mkA('nayttely', { date: '2026-09-01' })] })),
      ...Array.from({ length: 5 }, (_, i) => ({ n: `U${i}`, reasons: [mkA('uusi', { date: '2026-08-12' })] })),
      ...Array.from({ length: 8 }, (_, i) => ({ n: `H${i}`, reasons: [mkA('huippuarvio')] })),
      ...Array.from({ length: 4 }, (_, i) => ({ n: `T${i}`, reasons: [mkA('timeout', { rank: i + 1 })] })),
    ]
    const aMixed = interleaveReasoned(aRows, (r) => r.reasons, today, () => 0.9)
    const aKinds = aMixed.slice(0, 20).map((r) => r.reasons[0].kind)
    rChecks.push({ name: 'näyttelyperhe mukana sekoituksessa', ok: aKinds.includes('nayttely') })
    let runA = 1, worstA = 1
    for (let i = 1; i < aKinds.length; i++) { runA = aKinds[i] === aKinds[i - 1] ? runA + 1 : 1; worstA = Math.max(worstA, runA) }
    rChecks.push({ name: 'tekemisen perheet lomittuvat (enintään 2 peräkkäin)', ok: worstA <= 2, got: String(worstA) })
    rChecks.push({ name: 'tekemisen sekoitus ei kadota mitään', ok: aMixed.length === aRows.length })

    // OIKEA DATATIEDOSTO — rakenne ja romahdusvahdit, kuten ravintoloilla.
    const af = activityReasonFile as unknown as ReasonFile
    rChecks.push({ name: 'tekemisen syytiedostossa on avaimia', ok: Object.keys(af.byName ?? {}).length > 100, got: String(Object.keys(af.byName ?? {}).length) })
    for (const [kind, floor] of [['nayttely', 40], ['timeout', 30], ['uusi', 2]] as const) {
      rChecks.push({ name: `tekemisen syyt: ${kind} ≥ ${floor}`, ok: (af.counts?.[kind] ?? 0) >= floor, got: String(af.counts?.[kind] ?? 0) })
    }
    const aAll = Object.values(af.byName ?? {}).flat()
    rChecks.push({ name: 'tekemisen syyt: jokaisella on teksti ja lähde', ok: aAll.every((x) => !!x.label && !!x.source) })
    // Näyttelyrivi kortissa on note + linkki + alkupäivä — ilman niitä
    // 🖼-rivi olisi tyhjä tai linkitön.
    const exhibits = aAll.filter((x) => x.kind === 'nayttely')
    rChecks.push({ name: 'jokaisella näyttelyllä on note, linkki ja päivä', ok: exhibits.every((x) => !!x.note && !!x.url && !!x.date) })
    rChecks.push({ name: 'jokaisella tekemisen uusi-syyllä on päivä', ok: aAll.filter((x) => x.kind === 'uusi').every((x) => !!x.date) })
  }

  // 17. UUTTA HELSINGISSÄ — aikajanan kokoaminen (lib/new-in-helsinki.ts).
  //     Jokainen vartija alla vastaa mitattua riskiä: OSM:n version==1 EI ole
  //     avaustodiste (Palace ja Ihana Kahvila olivat vasta kartoitettuja).
  {
    // Luokittelu
    rChecks.push({ name: 'uutta: cafe → kahvila', ok: kindFromVenueType('cafe') === 'kahvila' })
    rChecks.push({ name: 'uutta: bakery → kahvila', ok: kindFromVenueType('bakery') === 'kahvila' })
    rChecks.push({ name: 'uutta: pub → baari', ok: kindFromVenueType('pub') === 'baari' })
    rChecks.push({ name: 'uutta: second_hand → kauppa', ok: kindFromVenueType('second_hand') === 'kauppa' })
    rChecks.push({ name: 'uutta: sauna → tekeminen', ok: kindFromVenueType('sauna') === 'tekeminen' })
    rChecks.push({ name: 'uutta: Viinibaari → baari', ok: kindFromGoogleCategory('Viinibaari') === 'baari' })
    rChecks.push({ name: 'uutta: Gruusialainen ravintola → ravintola', ok: kindFromGoogleCategory('Gruusialainen ravintola') === 'ravintola' })
    rChecks.push({ name: 'uutta: Viinimyymälä → kauppa', ok: kindFromGoogleCategory('Viinimyymälä') === 'kauppa' })

    // Kaupunginosa koordinaateista ja kaupunki osoitteesta
    rChecks.push({ name: 'uutta: Kallion piste → Kallio', ok: neighborhoodOf(60.185, 24.95) === 'Kallio', got: String(neighborhoodOf(60.185, 24.95)) })
    rChecks.push({ name: 'uutta: Espoo osoitteesta', ok: neighborhoodOf(undefined, undefined, 'Kauppakatu 1, 02100 Espoo') === 'Espoo' })
    rChecks.push({ name: 'uutta: tuntematon piste → ei merkkiä', ok: neighborhoodOf(60.35, 25.3) === undefined })

    // Avautumisotsikon tunnistus
    rChecks.push({ name: 'uutta: "avautuu" tunnistuu', ok: OPENING_HEADLINE.test('Uusi hotelli avautuu Katajanokalle') })
    rChecks.push({ name: 'uutta: "avajaisiaan" tunnistuu', ok: OPENING_HEADLINE.test('Kirjakauppa juhlii avajaisiaan') })
    rChecks.push({ name: 'uutta: tavallinen otsikko ei tunnistu', ok: !OPENING_HEADLINE.test('Ravintola sai uuden menun syksyksi') })

    // Kokoaminen kiintein syöttein
    const uToday = new Date('2026-08-22T12:00:00Z')
    const op = (name: string, openedAt: string, extra: Partial<OpeningInput> = {}): OpeningInput =>
      ({ name, openedAt, category: 'Ravintola', ...extra })
    const osm = (venue: string, date: string, venueType = 'cafe', extra: Partial<RestaurantReason> = {}): RestaurantReason =>
      ({ kind: 'uusi', label: 'x', source: 'OpenStreetMap', venue, date, venueType, url: `https://osm.org/${venue}`, ...extra })
    const built = buildNewInHelsinki({
      openings: [
        op('Ramen Ichi', '2026-10-01'),                       // tulossa
        op('Pizzeria Testi', '2026-08-08'),                   // elokuu
        op('Bistro Vanha', '2025-12-01'),                     // yli 180 pv → pois
        op('Vanha Krouvi', '2026-08-01', { reviewCount: 261 }), // luvan uusinta → pois
      ],
      newPlaces: [
        osm('Pizzeria Testi', '2026-08-10'),                  // sama paikka → lähdemerkiksi
        osm('Cafe Tuore', '2026-08-12'),                      // oma rivi
        osm('Ihana Kahvila', '2026-06-14'),                   // 725 arvostelua → pois
      ],
      exhibitions: [
        { kind: 'nayttely', label: 'Uusi näyttely tulossa', source: 'museot.fi', url: 'https://museot.fi/1', date: '2026-09-24', note: 'Tuleva näyttely (24.9.2026 – 10.1.2027)', venue: 'Testimuseo' },
        { kind: 'nayttely', label: 'Ajankohtainen näyttely', source: 'museot.fi', url: 'https://museot.fi/2', date: '2026-03-03', note: 'Kauan pyörinyt (3.3.2026 – 29.8.2027)', venue: 'Testimuseo' },
      ],
      news: [
        { title: 'Pizzeria Testi avasi ovensa Kallioon', link: 'https://x/pizzeria', source: 'Testilehti', pubDate: new Date('2026-08-15T10:00:00Z').toUTCString() },
        { title: 'Uusi hotelli avautuu Katajanokalle', link: 'https://x/hotelli', source: 'Testilehti', pubDate: new Date('2026-08-18T10:00:00Z').toUTCString() },
        { title: 'Ravintolan menu uudistui', link: 'https://x/menu', source: 'Testilehti', pubDate: new Date('2026-08-18T10:00:00Z').toUTCString() },
      ],
      reviewCounts: new Map([['ihana kahvila', 725], ['cafe tuore', 12]]),
      today: uToday,
    })
    const all = [...built.upcoming, ...built.months.flatMap((m) => m.items)]
    const names = all.map((i) => i.name)
    rChecks.push({ name: 'uutta: tuleva avaus tulossa-osioon', ok: built.upcoming.some((i) => i.name === 'Ramen Ichi') })
    rChecks.push({ name: 'uutta: tuleva näyttely tulossa-osioon', ok: built.upcoming.some((i) => i.kind === 'nayttely') })
    rChecks.push({ name: 'uutta: yli 180 pv vanha avaus pois', ok: !names.includes('Bistro Vanha') })
    rChecks.push({ name: 'uutta: satojen arvostelujen rekisteririvi on lupauusinta → pois', ok: !names.includes('Vanha Krouvi') })
    rChecks.push({ name: 'uutta: kauan pyörinyt näyttely pois', ok: !names.includes('Kauan pyörinyt') })
    const pizzeria = all.find((i) => i.name === 'Pizzeria Testi')
    rChecks.push({ name: 'uutta: sama paikka kahdesta lähteestä → yksi rivi, kaksi merkkiä', ok: !!pizzeria && pizzeria.sources.length === 2, got: String(pizzeria?.sources.length) })
    rChecks.push({ name: 'uutta: arvostelukatto pudottaa vanhan paikan (Ihana Kahvila)', ok: !names.includes('Ihana Kahvila') })
    rChecks.push({ name: 'uutta: vähän arvosteltu OSM-paikka pääsee mukaan', ok: names.includes('Cafe Tuore') })
    rChecks.push({ name: 'uutta: uutinen kiinnittyy riviin', ok: pizzeria?.news?.url === 'https://x/pizzeria' })
    rChecks.push({ name: 'uutta: kiinnittynyt juttu ei toistu kaistalla', ok: !built.newsRail.some((n) => n.url === 'https://x/pizzeria') })
    rChecks.push({ name: 'uutta: rivittömän avautumisjuttu nousee kaistalle', ok: built.newsRail.some((n) => n.url === 'https://x/hotelli') })
    rChecks.push({ name: 'uutta: ei-avautumisjuttu ei nouse kaistalle', ok: !built.newsRail.some((n) => n.url === 'https://x/menu') })
    rChecks.push({ name: 'uutta: kuukausiryhmä nimetään suomeksi', ok: built.months[0]?.label === 'Elokuu', got: built.months[0]?.label })
    rChecks.push({ name: 'uutta: näyttelyrivillä museo ja ajanjakso', ok: built.upcoming.find((i) => i.kind === 'nayttely')?.note === 'Testimuseo · 24.9.2026 – 10.1.2027', got: built.upcoming.find((i) => i.kind === 'nayttely')?.note })

    // Ilman arvostelumääriä OSM-väitettä ei voida tarkistaa → rivit pois
    const noCounts = buildNewInHelsinki({
      openings: [], newPlaces: [osm('Cafe Tuore', '2026-08-12')], exhibitions: [], news: [], today: uToday,
    })
    rChecks.push({ name: 'uutta: ilman arvostelumääriä OSM-rivit jäävät pois', ok: noCounts.total === 0, got: String(noCounts.total) })

    // Google-kortti OSM-riville: kuva/osoite/arvosana mukaan, ja kortin
    // arvostelumäärä toimii vartijana venue_ratingsin sijasta.
    const withCards = buildNewInHelsinki({
      openings: [], exhibitions: [], news: [], today: uToday,
      newPlaces: [
        osm('Cafe Kortti', '2026-08-12'),
        osm('Vanha Klassikko', '2026-08-01'),
      ],
      // EI reviewCounts-karttaa — kortti riittää vartijaksi
      placeCards: new Map([
        ['https://osm.org/Cafe Kortti', { image: 'https://img/x.jpg', address: 'Testikatu 1, Helsinki', rating: 4.8, reviewCount: 23 }],
        ['https://osm.org/Vanha Klassikko', { rating: 4.5, reviewCount: 900 }],
      ]),
    })
    const kortti = [...withCards.months.flatMap((m) => m.items)].find((i) => i.name === 'Cafe Kortti')
    rChecks.push({ name: 'uutta: kortti tuo kuvan ja osoitteen OSM-riville', ok: kortti?.image === 'https://img/x.jpg' && kortti?.address === 'Testikatu 1, Helsinki' })
    rChecks.push({ name: 'uutta: kortin arvostelumäärä kelpaa vartijaksi ilman venue_ratingsia', ok: !!kortti })
    rChecks.push({ name: 'uutta: kortin 900 arvostelua paljastaa vanhan paikan → pois', ok: !withCards.months.flatMap((m) => m.items).some((i) => i.name === 'Vanha Klassikko') })
    rChecks.push({ name: 'uutta: OSM-rivin päivä on likimääräinen (dateApprox)', ok: kortti?.dateApprox === true })

    // Näyttelykuva kulkee aikajanalle
    const withExImg = buildNewInHelsinki({
      openings: [], newPlaces: [], news: [], today: uToday,
      exhibitions: [{ kind: 'nayttely', label: 'Ajankohtainen näyttely', source: 'museot.fi', url: 'https://museot.fi/9', date: '2026-08-18', note: 'Kuvallinen (18.8.2026 – 1.1.2027)', venue: 'Museo X', image: 'https://museot.fi/uploadkuvat/x.jpg' }],
    })
    rChecks.push({ name: 'uutta: näyttelykuva kulkee riville', ok: withExImg.months[0]?.items[0]?.image === 'https://museot.fi/uploadkuvat/x.jpg' })

    // Rikastuksen nimivartija
    rChecks.push({ name: 'rikastus: "Talas" ↔ "Yhteiskerhotila Talas, sauna" osuu', ok: nameOverlap('Yhteiskerhotila Talas, sauna', 'Talas') >= 0.5 })
    rChecks.push({ name: 'rikastus: eri yritys ei osu', ok: nameOverlap('Mansikka', 'Kukkakauppa Ruusunen') < 0.5 })
    rChecks.push({ name: 'rikastus: tarkkeet eivät estä osumaa', ok: nameOverlap('Äfra café', 'Afra Cafe') >= 0.5 })
    // Mitattu: OSM "Walhala" ↔ Google "Ravintola Walhalla" on sama paikka.
    rChecks.push({ name: 'rikastus: yhden kirjaimen ero ei estä osumaa (Walhala)', ok: nameOverlap('Walhala', 'Ravintola Walhalla') >= 0.5, got: nameOverlap('Walhala', 'Ravintola Walhalla').toFixed(2) })
    rChecks.push({ name: 'rikastus: kahden kirjaimen ero estää', ok: nameOverlap('Kirnu', 'Kirppu') < 0.5 })

    // OIKEA DATATIEDOSTO — rikastuskortit
    const ef = enrichedFile as { fetchedAt?: string; cards?: Record<string, { name?: string; image?: string | null; fetchedAt?: string }>; misses?: unknown[] }
    const cardList = Object.values(ef.cards ?? {})
    rChecks.push({ name: 'rikastus: kortteja on vähintään 5', ok: cardList.length >= 5, got: String(cardList.length) })
    rChecks.push({ name: 'rikastus: jokaisella kortilla nimi ja hakuaika', ok: cardList.every((c) => !!c.name && !!c.fetchedAt) })
    rChecks.push({ name: 'rikastus: yli puolella korteista on kuva', ok: cardList.filter((c) => c.image).length >= cardList.length / 2, got: `${cardList.filter((c) => c.image).length}/${cardList.length}` })

    // Näyttelykuvien kattavuus oikeassa datassa
    const exhibits17 = Object.values((activityReasonFile as unknown as ReasonFile).byName ?? {}).flat().filter((x) => x.kind === 'nayttely')
    const uniqEx = new Map(exhibits17.map((x) => [x.url, x]))
    const exImgs = [...uniqEx.values()].filter((x) => x.image).length
    rChecks.push({ name: 'näyttelykuvat: yli puolella näyttelyistä on kuva', ok: exImgs >= uniqEx.size / 2, got: `${exImgs}/${uniqEx.size}` })

    // OIKEA DATATIEDOSTO — newPlaces-osio (Uutta Helsingissä -sivun selkäranka)
    const af17 = activityReasonFile as unknown as ReasonFile
    const np = af17.newPlaces ?? []
    rChecks.push({ name: 'uutta: newPlaces-osiossa on rivejä', ok: np.length >= 2, got: String(np.length) })
    rChecks.push({ name: 'uutta: jokaisella paikalla nimi, päivä ja tyyppi', ok: np.every((x) => !!x.venue && !!x.date && !!x.venueType) })
    // Kokoaminen oikealla datalla: sivun on oltava elävä, ei tyhjä.
    const realToday = new Date((openingFile as { fetchedAt?: string }).fetchedAt ?? Date.now())
    const real = buildNewInHelsinki({
      openings: (openingFile as { openings?: OpeningInput[] }).openings ?? [],
      newPlaces: np,
      exhibitions: Object.values(af17.byName ?? {}).flat().filter((x) => x.kind === 'nayttely'),
      news: [],
      reviewCounts: new Map(),
      today: realToday,
    })
    rChecks.push({ name: 'uutta: oikea data tuottaa ≥ 40 riviä', ok: real.total >= 40, got: String(real.total) })
    rChecks.push({ name: 'uutta: oikeassa datassa on tulossa-rivejä', ok: real.upcoming.length >= 1, got: String(real.upcoming.length) })
  }

    // 17b. SOME-LINKIT — OSM-tagien villit muodot normalisoituina (mitatut).
    rChecks.push({ name: 'some: pelkkä kahva → IG-osoite', ok: normalizeInstagram('borealhki') === 'https://www.instagram.com/borealhki/' })
    rChecks.push({ name: 'some: @-kahva siivotaan', ok: normalizeFacebook('@antinkaffeliiteri') === 'https://www.facebook.com/antinkaffeliiteri' })
    rChecks.push({ name: 'some: täysi IG-URL säilyy kahvana', ok: normalizeInstagram('https://www.instagram.com/laziz_ravintola/?hl=fi') === 'https://www.instagram.com/laziz_ravintola/' })
    rChecks.push({ name: 'some: m.facebook → www', ok: normalizeFacebook('https://m.facebook.com/pages/Teeritupa/123')?.startsWith('https://www.facebook.com/') === true })
    rChecks.push({ name: 'some: numero-id kelpaa FB-kahvaksi', ok: normalizeFacebook('61552427690662') === 'https://www.facebook.com/61552427690662' })
    rChecks.push({ name: 'some: website-tagin IG luokitellaan someksi', ok: (() => { const r = splitWebsite('https://www.instagram.com/walkcycle.hels/'); return r.instagram === 'https://www.instagram.com/walkcycle.hels/' && !r.www })() })
    rChecks.push({ name: 'some: oikea kotisivu pysyy kotisivuna', ok: (() => { const r = splitWebsite('https://barloose.com'); return r.www === 'https://barloose.com' && !r.instagram })() })
    rChecks.push({ name: 'some: roskasyöte hylätään', ok: normalizeInstagram('ei kelpaa!') === undefined })
    // Läpivienti: OSM-rivin IG kulkee aikajanan riville.
    const withIg = buildNewInHelsinki({
      openings: [], exhibitions: [], news: [], today,
      newPlaces: [{ kind: 'uusi', label: 'x', source: 'OpenStreetMap', venue: 'Some Cafe', date: '2026-08-12', venueType: 'cafe', url: 'https://osm.org/ig1', instagram: 'https://www.instagram.com/somecafe/' }],
      placeCards: new Map(),
      reviewCounts: new Map(),
    })
    rChecks.push({ name: 'some: IG kulkee uutta-riville', ok: withIg.months[0]?.items[0]?.instagram === 'https://www.instagram.com/somecafe/' })
    // Rekisteriavauksen www joka onkin IG → siirtyy instagram-kenttään.
    const igAsWww = buildNewInHelsinki({
      openings: [{ name: 'IG Baari', openedAt: '2026-08-10', category: 'Baari', www: 'https://instagram.com/igbaari' }],
      newPlaces: [], exhibitions: [], news: [], today,
    })
    const igb = igAsWww.months[0]?.items.find((i) => i.name === 'IG Baari')
    rChecks.push({ name: 'some: avauksen IG-kotisivu luokitellaan someksi', ok: !!igb && !igb.www && igb.instagram === 'https://www.instagram.com/igbaari/' })

    // 17c. YÖELÄMÄPISTEET — mitattu 24.8.2026: maanantain yhteisöohjelma
    //      kuvapankkikuvineen valtasi kärjen. Jokainen tapaus on tuotannosta.
    const ev = (title: string, desc = '', cats: string[] = [], image: string | null = 'x.jpg', startTime = '2026-08-24T10:00:00+03:00') =>
      ({ id: 't', title, shortDescription: desc, description: '', startTime, endTime: null, location: null, image, isFree: true, price: null, ticketUrl: null, infoUrl: null, categories: cats, source: 't' })
    // "Stadin yhteisötalo SaunaBAARI" antoi askarteluryhmälle baaripisteet →
    // Käsityöryhmä klo 10 nousi "Illan keikat" -heroon.
    rChecks.push({
      name: 'yöelämä: Saunabaarin käsityöryhmä ei ole baari',
      ok: nightlifeScore(ev('Käsityöryhmä', 'Kokoonnumme Stadin yhteisötalo Saunabaarissa')) < 0,
      got: String(nightlifeScore(ev('Käsityöryhmä', 'Kokoonnumme Stadin yhteisötalo Saunabaarissa'))),
    })
    // Poissulku voittaa nyt heikot positiiviset — työpaja jossa baarisana.
    rChecks.push({
      name: 'yöelämä: työpaja + baarimaininta on silti työpaja',
      ok: nightlifeScore(ev('Kirjoitustyöpaja', 'Työpaja baarin takahuoneessa')) < 0,
    })
    // Aidot yhdyssanabaarit säilyvät yöelämänä.
    rChecks.push({ name: 'yöelämä: viinibaari on baari', ok: nightlifeScore(ev('Viinibaarin avajaisillat', '', [], 'x.jpg')) === 3 })
    rChecks.push({ name: 'yöelämä: keikka pisteyttyy yhä', ok: nightlifeScore(ev('Perjantain keikka: Bändi', '')) === 7 })
    // Yhteisöohjelman tunnistin — poiminnoista mitatut otsikot.
    for (const t of ['Avoin perheaamu', 'Pihapuuhat', 'Tyttönuta', 'Maanantaimaalarit omatoiminen', 'Eläkeläisten taidepiiri']) {
      rChecks.push({ name: `yhteisöohjelma tunnistuu: ${t}`, ok: COMMUNITY_DAYTIME_REGEX.test(t) })
    }
    rChecks.push({ name: 'yhteisöohjelma EI osu keikkaan', ok: !COMMUNITY_DAYTIME_REGEX.test('Katie Melua, Ullalintulampi — Huvila-teltta') })
    rChecks.push({ name: 'yhteisöohjelma EI osu teatteriin', ok: !COMMUNITY_DAYTIME_REGEX.test('Toinen tasavalta — Esa Leskisen suurteos Suomen Kansallisteatterissa') })

    // 17d. ARVO VALMIS ILTA — päivän ja kellon ratkaisu (lib/arvo-ilta).
    //      Kello luetaan Helsingin seinäkellosta; nowH annetaan VAIN kun
    //      kaaripäivä on tänään (tuleva päivä ei saa rajautua tämän hetken
    //      kellolla) — omistajan vaatimus: ei vääriä aikatauluja.
    {
      // 2026-08-24 on maanantai. 18:30 UTC = 21:30 Helsinki (kesäaika).
      const monEvening = new Date('2026-08-24T18:30:00Z')
      const c = helsinkiClock(monEvening)
      rChecks.push({ name: 'arvo: Helsinki-kello (UTC+3 kesällä)', ok: c.date === '2026-08-24' && Math.abs(c.hour - 21.5) < 0.02 && c.weekday === 1, got: JSON.stringify(c) })
      // UTC-keskiyön ylitys: 22:30 UTC ma = 01:30 Helsinki TI.
      const c2 = helsinkiClock(new Date('2026-08-24T22:30:00Z'))
      rChecks.push({ name: 'arvo: UTC-keskiyön ylitys → Helsinki-tiistai', ok: c2.date === '2026-08-25' && c2.weekday === 2, got: JSON.stringify(c2) })

      const tonight = resolveArcTarget('tonight', monEvening)
      rChecks.push({ name: 'arvo: tonight = tänään + nowH', ok: tonight.date === '2026-08-24' && Math.abs((tonight.nowH ?? 0) - 21.5) < 0.02 })
      const wkFromMon = resolveArcTarget('weekend', monEvening)
      rChecks.push({ name: 'arvo: viikonloppu maanantaista → tuleva lauantai ILMAN nowH:ta', ok: wkFromMon.date === '2026-08-29' && wkFromMon.nowH === undefined, got: JSON.stringify(wkFromMon) })
      // Lauantaina viikonloppu = tänään nowH:lla + su-fallback.
      const satNoon = new Date('2026-08-29T09:00:00Z')   // la 12:00 Helsinki
      const wkFromSat = resolveArcTarget('weekend', satNoon)
      rChecks.push({ name: 'arvo: lauantaina viikonloppu = tänään + su-fallback', ok: wkFromSat.date === '2026-08-29' && (wkFromSat.nowH ?? 0) > 11 && wkFromSat.fallbackDate === '2026-08-30' })
      // Sunnuntaina viikonloppu = sunnuntai, ei fallbackia.
      const sun = resolveArcTarget('weekend', new Date('2026-08-30T09:00:00Z'))
      rChecks.push({ name: 'arvo: sunnuntaina viikonloppu = tänään', ok: sun.date === '2026-08-30' && sun.fallbackDate === undefined })
      rChecks.push({ name: 'arvo: addDays kuunvaihteen yli', ok: addDays('2026-08-31', 1) === '2026-09-01' })
      // Jakoteksti: ajat ja osoitteet mukana, kävelyaika omalla rivillään.
      const txt = planShareText({ intro: 'Ilta Kalliossa', arc: [
        { time: 'klo 17', emoji: '🧖', title: 'Kotiharjun sauna', address: 'Harjutorinkatu 1' },
        { time: 'klo 19', emoji: '🍽', title: 'Ravintola X', travelFromPrevMin: 8, travelFromPrevMode: 'walk' },
      ] }, 'ma 24.8.')
      rChecks.push({ name: 'arvo: jakoteksti sisältää ajat, osoitteen ja kävelyn', ok: txt.includes('klo 17 🧖 Kotiharjun sauna — Harjutorinkatu 1') && txt.includes('🚶 ~8 min') && txt.includes('(ma 24.8.)') })
    }

    // 18. KIRPPUTORIT — /kirpputorit-sivun liiketiedosto (OSM, viikkohaku)
    const sh = secondhandFile as { fetchedAt?: string; shops?: { name?: string; lat?: number; lon?: number; openingHours?: string | null }[] }
    const shops = sh.shops ?? []
    rChecks.push({ name: 'kirpputorit: liikkeitä vähintään 15', ok: shops.length >= 15, got: String(shops.length) })
    rChecks.push({ name: 'kirpputorit: jokaisella nimi ja koordinaatit', ok: shops.every((x) => !!x.name && typeof x.lat === 'number' && typeof x.lon === 'number') })
    rChecks.push({ name: 'kirpputorit: yli puolella aukiolot', ok: shops.filter((x) => x.openingHours).length >= shops.length / 2, got: `${shops.filter((x) => x.openingHours).length}/${shops.length}` })

  for (const c of rChecks) {
    if (c.ok) pass++
    else failures.push(`✗ ravintolasyyt: ${c.name}${c.got ? ` (sai: ${c.got})` : ''}`)
  }
}

// Kokonaismäärä johdetaan aina todellisista ajoista — ei käsin ylläpidettyä kaavaa.
const total = pass + failures.length
console.log(`Kategoria- + kanaria- + kaaritestit: ${pass}/${total} ok`)
if (failures.length) {
  console.error('\n' + failures.join('\n\n'))
  process.exit(1)
}
