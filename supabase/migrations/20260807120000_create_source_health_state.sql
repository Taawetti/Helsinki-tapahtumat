-- Aja tämä Supabase SQL-editorissa. Venue-skraperien terveysputket: päivittäinen
-- kanaria (/api/cron/source-health) lukee jokaisen skraperireitin meta-kentän ja
-- pitää kirjaa peräkkäisistä 0-päivistä ja virhepäivistä. Hälytys vasta kun
-- putki ylittää kynnyksen (0-live ≥ 5 pv tai virhe ≥ 2 pv) — yksittäinen
-- hetkellinen häiriö tai laillinen hiljainen viikko ei hälytä.

CREATE TABLE IF NOT EXISTS source_health_state (
  source        TEXT PRIMARY KEY,          -- reitin nimi, esim. 'juttutupa'
  zero_streak   INT NOT NULL DEFAULT 0,    -- peräkkäiset päivät live == 0
  error_streak  INT NOT NULL DEFAULT 0,    -- peräkkäiset päivät kovalla virheellä
  live          INT,                       -- viimeisin parsittu määrä (ennen ikkunaa)
  scrape_error  TEXT,                      -- viimeisin virheviesti (null = ok)
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE source_health_state ENABLE ROW LEVEL SECURITY;
-- Ei anon-policyja: kirjoitus/luku vain palvelimen service-role -clientillä.

NOTIFY pgrst, 'reload schema';

-- Tarkistus:
-- SELECT source, zero_streak, error_streak, live, scrape_error FROM source_health_state ORDER BY source;
