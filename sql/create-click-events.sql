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

create table if not exists click_events (
  id         bigint generated always as identity primary key,
  kind       text not null,
  surface    text,
  event_id   text,
  label      text,
  meta       text,
  created_at timestamptz not null default now()
);

-- Raportit kysyvät aina aikaväliltä ja ryhmittelevät kindin tai event_id:n
-- mukaan. Nämä kaksi indeksiä kattavat molemmat.
create index if not exists click_events_created_idx on click_events (created_at desc);
create index if not exists click_events_kind_idx    on click_events (kind, created_at desc);

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
