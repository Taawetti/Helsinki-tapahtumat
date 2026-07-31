-- Aja tämä Supabase SQL-editorissa. Ryhmäpäätös v3: oma päivävalinta,
-- alue (kaupunginosa) ja budjetti session luonnissa.

ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS custom_start DATE;
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS custom_end DATE;
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT 'kaikki';
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS budget TEXT NOT NULL DEFAULT 'any';

NOTIFY pgrst, 'reload schema';

-- Tarkistus:
-- SELECT id, when_filter, custom_start, custom_end, area, budget FROM group_sessions ORDER BY created_at DESC LIMIT 5;
