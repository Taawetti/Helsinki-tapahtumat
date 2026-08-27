-- Kävijätapahtumat: mitä sovelluksessa klikataan ja mitä osioita käytetään.
--
-- MIKSI OMA TAULU EIKÄ VERCEL WEB ANALYTICS. Koko sovellus elää yhdessä
-- osoitteessa: välilehtien vaihto, oppaat, kartta, suosikit ja tapahtuman
-- avaus ovat React-tilaa, eivät osoitteenmuutoksia. Vercel kirjaa siksi koko
-- istunnosta yhden "/"-sivulatauksen riippumatta siitä avaako käyttäjä 20
-- tapahtumaa vai ei. Lisäksi Vercelin analytiikasta ei voi lukea dataa
-- rajapinnan kautta, joten omia raportteja ei voi rakentaa sen päälle.
--
-- EI YHTÄÄN TUNNISTETTA. Tässä taulussa ei ole laite-, istunto- eikä
-- käyttäjätunnistetta eikä IP-osoitetta. Se on tietoinen valinta: ilman
-- tunnistetta rivit eivät ole henkilötietoa, jolloin tietosuojaselostetta ei
-- tarvitse muuttaa eikä evästesuostumusta kysyä. Vastineeksi ei voi laskea
-- yksilöllisiä kävijöitä eikä suppiloita — vain määriä. Se riittää siihen mitä
-- omistaja pyysi (mitä klikataan, mitä osioita käytetään, lippuklikit).
-- ÄLÄ lisää tähän tauluun tunnistetta miettimättä tietosuojaselostetta uusiksi.
--
-- kind      = mitä tapahtui (whitelist API-reitissä, ei vapaa teksti)
-- surface   = MISTÄ pinnasta se tuli (ruudukko, poiminnat, haku, hero, kartta,
--             idea, paikka) — juuri tämä kertoo mikä osio tuottaa klikkauksia
-- event_id  = tapahtuman tunniste, jotta voi raportoida tapahtumakohtaisesti
-- label     = ihmisluettava nimi (tapahtuman otsikko, osion nimi, domain)
-- meta      = pieni vapaa kenttä (esim. kategoria, onko ilmainen)
-- country   = kaksikirjaiminen maakoodi (FI, SE, DE…) Vercelin otsakkeesta.
--             MAAKOODI YKSINÄÄN EI OLE HENKILÖTIETO — se on maan tarkkuudella
--             eikä siitä voi tunnistaa ketään, eikä IP-osoitetta tallenneta.
-- visitor   = KÄVIJÄTIIVISTE eri kävijöiden laskemiseen.
--             Lasketaan palvelimella: sha256(IP + selain + KUUKAUSIKOHTAINEN
--             salainen suola), josta tallennetaan 16 merkkiä. IP-osoitetta
--             EI tallenneta missään vaiheessa eikä selaimeen kirjoiteta mitään.
--
--             MIKSI SUOLA VAIHTUU KUUKAUSITTAIN. Pysyvä suola tekisi
--             tiivisteestä pysyvän tunnisteen, jolla saman ihmisen voisi
--             yhdistää kuukausien yli — se olisi seurantaa. Kuukausittain
--             vaihtuva suola antaa tarkan luvun kuukauden sisällä ja katkaisee
--             yhteyden kuukausien välillä. "Kaikkien aikojen eri kävijät" ei
--             siis ole laskettavissa, eikä sen kuulukaan olla.
--
--             ePrivacy: selaimeen ei tallenneta mitään, joten evästesuostumusta
--             ei tarvita. GDPR: tiivistettä on kohdeltava henkilötietona, ja se
--             on kerrottu tietosuojaselosteessa.
-- region    = maakunta ISO 3166-2 -koodina (Suomessa 01–19) samasta lähteestä.
--             Tallennetaan kaupungin RINNALLE eikä johdeta kaupunkinimestä:
--             kuntia on yli 300, ja käsin tehty nimi→maakunta-taulukko
--             vanhenisi ja jättäisi pienet kunnat luokittelematta.
-- city      = kaupunki samasta lähteestä. Tämä on askel tarkempaan, joten se
--             harkittiin erikseen: koska taulussa EI ole tunnistetta, kahta
--             riviä ei voi yhdistää samaan ihmiseen, eikä pelkkä määrä
--             kaupungeittain eristä ketään. Rivit pysyvät ei-henkilötietona.
--             ÄLÄ lisää tähän IP-osoitetta, postinumeroa tai koordinaatteja —
--             ne muuttaisivat tilanteen ja vaatisivat selosteen uusiksi.
--             HUOM TARKKUUS: sijainti on IP-paikannusta. Moni mobiiliverkon
--             käyttäjä näkyy Helsingissä oikeasta sijainnista riippumatta,
--             joten luvut ovat suuntaa antavia eivätkä tarkkoja.

create table if not exists click_events (
  id         bigint generated always as identity primary key,
  kind       text not null,
  surface    text,
  event_id   text,
  label      text,
  meta       text,
  country    text,
  city       text,
  region     text,
  visitor    text,
  created_at timestamptz not null default now()
);

-- Jos taulu oli jo luotu ilman maasaraketta, tämä lisää sen. Turvallinen ajaa
-- monta kertaa.
alter table click_events add column if not exists country text;
alter table click_events add column if not exists city    text;
alter table click_events add column if not exists region  text;
alter table click_events add column if not exists visitor text;

-- Raportit kysyvät aina aikaväliltä ja ryhmittelevät kindin tai event_id:n
-- mukaan. Nämä kaksi indeksiä kattavat molemmat.
create index if not exists click_events_created_idx on click_events (created_at desc);
create index if not exists click_events_kind_idx    on click_events (kind, created_at desc);
create index if not exists click_events_country_idx on click_events (country, created_at desc);
create index if not exists click_events_city_idx    on click_events (city, created_at desc);
create index if not exists click_events_visitor_idx on click_events (visitor, created_at desc);

-- Siivous: raportointi katsoo enintään vuoden taakse. Aja ajoittain, jottei
-- taulu kasva rajatta.
--   delete from click_events where created_at < now() - interval '400 days';

alter table click_events enable row level security;

-- EI YHTÄÄN POLICYÄ. Kirjoitus tapahtuu vain palvelinpuolelta
-- service_role-avaimella (/api/track) ja luku vain admin-reitistä
-- (/api/admin/stats). Anon-avaimella taulua ei voi lukea eikä kirjoittaa —
-- klikkidata ei kuulu selaimeen.

-- PostgREST ei huomaa uutta taulua ilman tätä.
notify pgrst, 'reload schema';
