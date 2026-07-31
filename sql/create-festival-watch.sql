-- Aja tämä Supabase SQL-editorissa. Festivaalien muutosvahti (korvaa
-- weekly-discover-cronin SERP+AI-ajot): seurataan festivaalien kotisivujen
-- sisältöhashia ja merkitään muutokset — AI-extraktointi vain muutoksen sattuessa.

CREATE TABLE IF NOT EXISTS festival_watch (
  festival_id TEXT PRIMARY KEY REFERENCES festivals(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,                -- seurattava sivu (festivals.info_url)
  hash        TEXT NOT NULL,                -- normalisoidun HTML:n sha256
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_at  TIMESTAMPTZ                   -- viimeisin havaittu muutos (null = ei koskaan)
);

ALTER TABLE festival_watch ENABLE ROW LEVEL SECURITY;
-- Ei anon-policyja: kirjoitus/luku vain palvelimen service-role -clientillä.

NOTIFY pgrst, 'reload schema';

-- Tarkistus:
-- SELECT festival_id, changed_at, checked_at FROM festival_watch ORDER BY checked_at DESC LIMIT 10;
