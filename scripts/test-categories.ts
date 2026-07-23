// Kategorialuokittelun regressiotestit — kultaiset tapaukset syväauditoinnista
// 2026-07-22 + kerrosarkkitehtuurin tapaukset (venue-kartta, globaalit vetot).
//
// Aja: npm run test:categories   (ajetaan myös automaattisesti ennen buildia)
//
// SÄÄNTÖ: jokainen tuotannosta löydetty luokitteluvirhe lisätään tänne
// testinä ENNEN kuin sääntöjä korjataan — näin sama virhe ei voi palata.
// Testit ovat puhtaita fixtureita: ei verkkoa, ei ympäristöriippuvuuksia.

import { classifyEvent, extractYsoIds } from '../lib/event-classify'

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

const total = CASES.length + ysoChecks.length
console.log(`Kategoriatestit: ${pass}/${total} ok`)
if (failures.length) {
  console.error('\n' + failures.join('\n\n'))
  process.exit(1)
}
