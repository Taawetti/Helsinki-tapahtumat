-- Terveysverdiktien tila — /api/health?deep=1 -hystereesin muisti.
--
-- MIKSI TAULU: syvä terveystarkistus heilui DOWN↔UP koska eri palvelin-
-- yksiköillä on eri välimuistit, ja UptimeRobot lähetti sähköpostin joka
-- heilahduksesta. Verdiktin muisti ei voi asua palvelinyksikössä — sen on
-- oltava jaettu. Yksi rivi per tarkistus (nyt vain 'deep').
--
-- Aja Supabase SQL -editorissa (tyhjennä editori ensin).

create table if not exists health_state (
  id         text primary key,
  status     text not null check (status in ('ok', 'down')),
  changed_at timestamptz not null default now(),
  ok_since   timestamptz,
  -- viimeisin mittaus vianetsintää varten (mitä issues-listalla oli)
  issues     jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- RLS päälle ilman politiikkoja: vain service-avain (palvelin) pääsee käsiksi.
alter table health_state enable row level security;

notify pgrst, 'reload schema';
