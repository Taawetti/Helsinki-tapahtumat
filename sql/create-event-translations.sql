-- Tapahtumasisällön käännösvälimuisti.
--
-- MIKSI. Käyttöliittymä on käännetty englanniksi, mutta tapahtumien OMA sisältö
-- (otsikko, kuvaus) tulee lähteistä suomeksi. Mitattu 25.8.2026 LinkedEventsin
-- 100 tapahtuman otoksesta: vain 6 %:lla on name.en ja 4 %:lla se poikkeaa
-- suomesta — niissäkin name.fi on tyhjä. Lähdedataa ei siis ole olemassa, joten
-- käännös on tuotettava itse.
--
-- MIKSI TAULU EIKÄ VASTAUSVÄLIMUISTI. /api/events-vastaukset vanhenevat
-- 15 min–1 h välein. Jos käännös eläisi niiden mukana, sama tapahtuma
-- käännettäisiin kymmeniä kertoja päivässä. Mitattu hinta: viikon aineisto
-- (216 tapahtumaa, 114k merkkiä) maksaa Haikulla ~0,21 $ kerran. Tunnin välein
-- uusittuna se olisi ~35 $/viikko. Pysyvä välimuisti tekee siitä ~0,21 $/viikko.
--
-- source_hash: jos lähde muokkaa tapahtuman tekstiä, hash muuttuu ja rivi
-- käännetään uudelleen. Ilman sitä vanha käännös jäisi elämään ikuisesti.

create table if not exists event_translations (
  event_id     text not null,
  lang         text not null,
  source_hash  text not null,
  title        text,
  short_description text,
  description  text,
  created_at   timestamptz not null default now(),
  primary key (event_id, lang)
);

-- Haku tehdään aina (event_id, lang) -parilla ja verrataan source_hashia.
-- Pääavain kattaa haun; erillistä indeksiä ei tarvita.

-- Siivous: käännökset vanhenevat kun tapahtuma on mennyt. Poista yli 120 vrk
-- vanhat rivit ajoittain, jottei taulu kasva rajatta.
--   delete from event_translations where created_at < now() - interval '120 days';

alter table event_translations enable row level security;

-- Luku on julkista (käännökset eivät ole salaisia), kirjoitus vain
-- service_role-avaimella eli palvelinpuolelta.
drop policy if exists "event_translations_read" on event_translations;
create policy "event_translations_read"
  on event_translations for select
  using (true);

-- PostgREST ei huomaa uutta taulua ilman tätä.
notify pgrst, 'reload schema';
