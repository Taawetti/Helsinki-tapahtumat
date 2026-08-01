-- Ryhmäpäätös: salainen host-tunniste. host_id on julkinen (GET-payload) eikä
-- todella suojaa host-toimintoja — uusilla sessioilla host_secret, jota ei
-- koskaan palauteta API:sta. Vanhat sessiot toimivat legacy-tarkistuksella.
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS host_secret TEXT;

NOTIFY pgrst, 'reload schema';

-- Tarkistus:
-- SELECT id, host_id, host_secret FROM group_sessions ORDER BY created_at DESC LIMIT 5;
