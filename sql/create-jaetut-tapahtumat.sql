-- Jaettujen tapahtumien tilannekuvat — /e/[id] avaa sovelluksen infokortin
-- myös silloin kun tapahtuma on jo poistunut koosteesta (mennyt, lähde
-- muuttui, dedup valitsi toisen tunnisteen).
--
-- MIKSI TAULU: jakolinkki vie AINA sovellukseen (omistaja 28.9.2026), mutta
-- skrapattujen lähteiden tapahtumia ei voi hakea tunnisteella lähteestä.
-- Jakohetkellä palvelin hakee tapahtuman OMASTA koosteestaan ja tallentaa
-- sen tähän — selaimen lähettämää sisältöä ei tallenneta koskaan.
--
-- Aja Supabase SQL -editorissa (tyhjennä editori ensin).

create table if not exists jaetut_tapahtumat (
  id         text primary key,          -- sovelluksen tapahtumatunniste (= /e/[id])
  paiva      date not null,             -- tapahtuman päivä (Helsinki)
  tapahtuma  jsonb not null,            -- koosteen Event-olio sellaisenaan
  jaettu_at  timestamptz not null default now()
);

create index if not exists jaetut_tapahtumat_paiva_idx on jaetut_tapahtumat (paiva);

-- RLS päälle ilman politiikkoja: vain service-avain (palvelin) lukee ja kirjoittaa.
alter table jaetut_tapahtumat enable row level security;

notify pgrst, 'reload schema';
