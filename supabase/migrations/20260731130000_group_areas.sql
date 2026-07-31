-- Ryhmäpäätös v3.1: monivalitut alueet (kaupunginosat/kunnat listana).
-- area-sarake säilyy taaksepäin yhteensopivuuden vuoksi; uusi logiikka käyttää
-- areas-listaa (jos ei tyhjä), muuten area-kenttää.
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS areas TEXT[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';

-- Tarkistus:
-- SELECT id, area, areas FROM group_sessions ORDER BY created_at DESC LIMIT 5;
