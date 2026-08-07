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
  type CanaryPayload,
  type StreakState,
  type VenueScrapeSample,
} from '../lib/source-health'
import { parseSuperterassi, parseSeason } from '../lib/superterassi'
import { parseSetlistText, parseFinnishDate } from '../lib/flyingdutchman-parse'
import { weekParamDates } from '../lib/stadissa-weeks'
import { buildDeterministicArc } from '../lib/group-arc'
import { closedOnArcDay, subtypeOf } from '../lib/group-scheduler'
import { walkMinutesBetween } from '../lib/group'
import type { Candidate, CandidateRole } from '../lib/candidate'

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

// 6. Mahdoton tilanne: ohjelma 18:00, aktiviteetti (2h) ja nyt klo 17 →
//    aktiviteetti PUTOSI (ei mennyttä/kiireistä vaihetta kaaressa)
{
  const aktiviteetti = mkCand({ role: 'activity', title: 'Aktiviteetti', tags: ['museo'], openingHours: 'Mo-Su 09:00-23:00', ...CENTER, _score: 3 })
  const keikka18 = mkCand({ type: 'event', role: 'program', title: 'Keikka klo 18', tags: ['keikka'], time: 'to 18.00', ...CENTER, _score: 5 })
  const plan = buildDeterministicArc([aktiviteetti, keikka18], mkVotes({ [aktiviteetti.id]: 2, [keikka18.id]: 2 }), superEi, { when: 'tonight', date: ARC_DAY, nowH: 17 })
  arcFixtures.push({ name: 'mahdoton joustava vaihe putoaa ankkurin tieltä', ok: plan != null && !plan.arc.some(s => s.title === 'Aktiviteetti') && plan.arc.some(s => s.role === 'program') })
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

const arcChecks = arcFixtures
for (const c of arcChecks) {
  if (c.ok) pass++
  else failures.push(`✗ kaarimoottori: ${c.name}`)
}

// Kokonaismäärä johdetaan aina todellisista ajoista — ei käsin ylläpidettyä kaavaa.
const total = pass + failures.length
console.log(`Kategoria- + kanaria- + kaaritestit: ${pass}/${total} ok`)
if (failures.length) {
  console.error('\n' + failures.join('\n\n'))
  process.exit(1)
}
