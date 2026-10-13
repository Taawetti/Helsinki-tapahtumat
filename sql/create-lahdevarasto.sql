-- Lähdevarasto — valmiiksi koottu tapahtumavarasto (lib/lahdevarasto.ts).
--
-- MIKSI TAULU: /api/events kokosi tapahtumat 45 ulkoisesta lähteestä JOKA
-- pyynnöllä sisäisinä funktiokutsuina (yksi välimuistin ohittava kooste =
-- 45 funktiokutsua), ja CDN-lämmitys toisti sen viidelle aikaikkunalle 5 min
-- välein (~440 kutsua / 10 min). Vercel hälytti 10.10.2026, kun kahdeksan
-- Facebookin esikatseluhakijaa avasi jaetun linkin samalla sekunnilla ja
-- kutsut viisinkertaistuivat. Nyt rakentaja (app/api/warm) hakee jokaisen
-- lähteen 10 päivän palan taustalla kerran päivitysvälissä, ja kooste lukee
-- palat täältä yhdellä kyselyllä. LinkedEvents ei ole täällä: sen päiväpalat
-- ovat jo Vercelin datavälimuistissa (fetch revalidate 300).
--
-- Rivi = (lähde, 10 päivän pala). Pala on kohdistettu kiinteään ruudukkoon
-- (epookkipäivä − epookkipäivä mod 10), joten eri pyynnöt jakavat samat rivit.
-- tapahtumat = lähdereitin palauttamat Event-oliot aikaleimat normalisoituina,
-- rajattuna palaan (alkupäivä alku−4 … loppu; −4 = käynnissä olevan lyhyen
-- monipäiväisen tapahtuman sääntö koosteessa).
-- haettu = viimeisin ONNISTUNUT haku; yritetty = viimeisin yritys (myös
-- epäonnistunut) — epäonnistuminen ei pyyhi edellistä onnistunutta dataa.
--
-- Aja Supabase SQL -editorissa (tyhjennä editori ensin).

create table if not exists lahdevarasto (
  lahde       text not null,                        -- lähdereitin nimi (api/<lahde>)
  alku        date not null,                        -- palan ensimmäinen päivä (Helsinki)
  loppu       date not null,                        -- palan viimeinen päivä = alku + 9
  tapahtumat  jsonb not null default '[]'::jsonb,   -- Event[] (lib/types)
  lkm         integer not null default 0,
  ok          boolean not null default false,       -- viimeisin yritys onnistui
  virhe       text,
  kesto_ms    integer,
  haettu      timestamptz,                          -- viimeisin onnistunut haku
  yritetty    timestamptz,                          -- viimeisin yritys (lukitus rinnakkaisille rakentajille)
  primary key (lahde, alku)
);

create index if not exists lahdevarasto_alku_idx on lahdevarasto (alku);

-- RLS päälle ilman politiikkoja: vain service-avain (palvelin) lukee ja kirjoittaa.
alter table lahdevarasto enable row level security;

notify pgrst, 'reload schema';
