-- Aja tämä Supabase SQL-editorissa (tyhjennä editori ensin).
-- Tallentaa On the Rocks- ja Tavastia-skraperin tapahtumat.

CREATE TABLE IF NOT EXISTS scraped_events (
  id             TEXT PRIMARY KEY,          -- 'otr-{slug}' | 'tavastia-{id}'
  venue_id       TEXT NOT NULL,             -- 'on-the-rocks' | 'tavastia'
  venue_name     TEXT NOT NULL,
  title          TEXT NOT NULL,
  start_datetime TIMESTAMPTZ NOT NULL,
  image_url      TEXT,
  ticket_url     TEXT NOT NULL,
  price_info     TEXT,
  is_free        BOOLEAN NOT NULL DEFAULT false,
  scraped_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraped_events_start
  ON scraped_events(start_datetime);

ALTER TABLE scraped_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read scraped_events"
  ON scraped_events FOR SELECT TO anon USING (true);

-- Ilmoita PostgREST uudesta taulusta
NOTIFY pgrst, 'reload schema';
