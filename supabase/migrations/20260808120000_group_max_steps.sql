-- Aja tämä Supabase SQL-editorissa (tai Supabase GitHub -integraatio ajaa
-- automaattisesti). Ryhmäpäätössession vaihemäärä: isäntä valitsee luodessaan
-- montako vaihetta kaareen tulee (2 = kevyt ilta, 3 = perus, 4 = koko ilta).
-- Oletus 4 säilyttää nykyisen käytöksen vanhoille sessioille.

ALTER TABLE group_sessions
  ADD COLUMN IF NOT EXISTS max_steps SMALLINT NOT NULL DEFAULT 4;

NOTIFY pgrst, 'reload schema';

-- Tarkistus:
-- SELECT id, max_steps FROM group_sessions ORDER BY rowid DESC LIMIT 5;
