// Tutkitut ja tietoisesti hylätyt lähteet.
//
// MIKSI TÄMÄ ON OLEMASSA. Maanantain korjausagentti saa listan lähteistä jotka
// palauttavat nollan. Ilman tätä tiedostoa se tutkisi joka viikko uudelleen
// samat lähteet, joista on jo kertaalleen päätetty ettei niitä kannata korjata
// — maksaisi rahaa ja tuottaisi PR-ehdotuksia jotka on jo hylätty.
//
// TÄMÄ EI OLE HILJENTÄMINEN. Nämä lähteet näkyvät ajon tulosteessa omana
// osionaan perusteluineen, ja jokaisella on `checked`-päivä. Kun päivä on
// vanha, syy kannattaa tarkistaa uudelleen: Billettoon voi ilmestyä tapahtumia
// ja Meetup voi julkaista uuden rajapinnan. Ero hylkäämisen ja unohtamisen
// välillä on juuri se, että hylkäämisellä on kirjattu syy ja päivämäärä.
//
// Kaikki alla olevat perustelut on MITATTU 22.8.2026, ei arvattu.

export interface TriageEntry {
  /** Miksi tätä ei korjata. Konkreettinen ja mitattu, ei "ei toimi". */
  reason: string
  /** Milloin syy on viimeksi todennettu (YYYY-MM-DD). */
  checked: string
  /** Mikä muuttaisi päätöksen. */
  revisitIf: string
}

export const KNOWN_SILENT: Record<string, TriageEntry> = {
  billetto: {
    reason:
      'Ei vika. Billetto.fi:n KOKO julkisessa katalogissa oli 3 tapahtumaa ' +
      '(mm. Liminka), joista yksikään ei ollut Helsingissä. Lähde vastaa oikein, ' +
      'se on vain tyhjä.',
    checked: '2026-08-22',
    revisitIf: 'Billetton Suomen-katalogi kasvaa — tarkista totals kerran kaudessa.',
  },
  finna: {
    reason:
      'Kysely käyttää sector_str_mv-fasetille arvoa "Museoala", jota ei ole ' +
      'olemassa: fasetti hyväksyy vain hierarkkiset koodit (0/lib/, 0/mus/, …). ' +
      'Korjauksen takana on toinen este, eikä käyttökelpoista tapahtumadataa ' +
      'ollut saatavissa.',
    checked: '2026-08-22',
    revisitIf: 'Finna julkaisee tapahtumahaun — nykyinen aineisto on kokoelmadataa.',
  },
  ilmonet: {
    reason:
      'Vaatii ILMONET_API_KEY-avaimen, jota ei ole. Omistajan päätös 22.8.2026: ' +
      'lähdettä EI oteta käyttöön. Sisältö on työväenopistojen kursseja (2195 kpl), ' +
      'ei kulttuuritapahtumia, ja se hukuttaisi pääsyötteen alleen.',
    checked: '2026-08-22',
    revisitIf: 'Kurssit halutaan omaan erilliseen näkymäänsä. HUOM: ennen käyttöönottoa ' +
      'on korjattava source-arvo (nyt "linked-events" → tuottaisi 404-linkit) ja ' +
      'limit=50-katto.',
  },
  liiga: {
    reason:
      'thesportsdb:n ilmaisavain ei enää palauta otteluohjelmaa: eventsseason ' +
      'antaa 5 ottelua ja eventsnextleague yhden. Ainoa Helsinki-joukkueen ' +
      'ottelu oli Jokerien VIERASOTTELU Vaasassa, eli ei edes helsinkiläinen ' +
      'tapahtuma.',
    checked: '2026-08-22',
    revisitIf: 'Maksullinen thesportsdb-avain hankitaan tai otteluohjelma haetaan liiga.fi:stä.',
  },
  meetup: {
    reason:
      'Rajapinta api.meetup.com/gql on poistettu (HTTP 404 reitin omalla ' +
      'kyselyllä). Korjaus vaatisi kokonaan uuden hakutavan, ei parametrimuutosta.',
    checked: '2026-08-22',
    revisitIf: 'Meetup julkaisee korvaavan julkisen rajapinnan.',
  },
  sports: {
    reason:
      'Vastakkainen tarkistus kumosi korjausehdotuksen: se toisi 0 uutta ' +
      'tapahtumaa ja TURMELISI yhden olemassa olevan. Ottelut tulevat jo muista ' +
      'lähteistä.',
    checked: '2026-08-22',
    revisitIf: 'Lähde halutaan poistaa kokonaan EXTERNAL_SOURCES-listalta.',
  },
  visitfinland: {
    reason:
      'Korjattavissa mutta arvoton: 2 uutta korttia. Ehdotettu päiväklamppi ' +
      'toisi lisäksi takaisin "alkaa tänään" -valheen, joka juuri poistettiin ' +
      'LinkedEvents-reiteiltä.',
    checked: '2026-08-22',
    revisitIf: 'Visit Finlandin Helsinki-tarjonta kasvaa merkittävästi.',
  },
  recurring: {
    reason:
      'Kausilähde, ei vika. Superterassin kesäohjelma pyörii ~12.6.–13.8., ' +
      'joten nolla sen ulkopuolella on oikea tulos. Kanarialla on tälle oma ' +
      'kausilattia (SEASONAL_SOURCE_FLOORS, heinäkuu).',
    checked: '2026-08-22',
    revisitIf: 'Ei koskaan — tämä on odotettu käytös. Kausilattia hälyttää jos kesä on tyhjä.',
  },
}

/** Onko lähde tutkittu ja hylätty? */
export function isKnownSilent(source: string): boolean {
  return source in KNOWN_SILENT
}

/** Kuinka monta päivää sitten syy on tarkistettu (Infinity jos tuntematon). */
export function daysSinceChecked(source: string, today: string): number {
  const entry = KNOWN_SILENT[source]
  if (!entry) return Infinity
  const a = Date.parse(`${entry.checked}T12:00:00Z`)
  const b = Date.parse(`${today}T12:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return Infinity
  return Math.floor((b - a) / 86400000)
}

/** Kuinka vanhana hylkäysperustelu kannattaa tarkistaa uudelleen. */
export const TRIAGE_STALE_DAYS = 180
