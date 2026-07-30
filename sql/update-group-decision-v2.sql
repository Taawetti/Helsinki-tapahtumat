-- Aja tämä Supabase SQL-editorissa create-group-decision.sql:n JÄLKEEN.
-- Päättäkää yhdessä v2: pikapäätös-moodi, kierrokset (rematch), session-push.

-- Moodi: 'arc' = AI kutoo illan kaaren (oletus), 'quick' = ensimmäinen
-- enemmistön ❤️ voittaa heti.
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'arc';

-- Kierrosnumero: "jatka samalla porukalla" (rematch) kasvattaa → klientit
-- havaitsevat kierroksen vaihtuneen ja nollaavat paikalliset äänestysmuistinsa.
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS round INT NOT NULL DEFAULT 1;

-- Sessiokohtaiset push-tilaukset ("ilmoita kun kaari/voittaja valmis").
-- Erillään push_subscriptions-taulusta: eivät saa päivittäisiä digest-pushja,
-- ja siivoutuvat session mukana (ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS group_push (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
  voter_id    TEXT NOT NULL,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, endpoint)                  -- upsert-avain
);

CREATE INDEX IF NOT EXISTS idx_group_push_session ON group_push(session_id);

ALTER TABLE group_push ENABLE ROW LEVEL SECURITY;
-- Ei anon-policyja lainkaan: luku ja kirjoitus vain palvelimen service-role
-- -clientillä /api/group/[code]/push-subscribe -reitin kautta.

NOTIFY pgrst, 'reload schema';

-- Tarkistus:
-- SELECT id, mode, round, status FROM group_sessions ORDER BY created_at DESC LIMIT 5;
-- SELECT * FROM group_push LIMIT 5;
