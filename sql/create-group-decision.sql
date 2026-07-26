-- Aja tämä Supabase SQL-editorissa (tyhjennä editori ensin), sitten reload the API schema.
-- Ryhmäpäätöskone "Päättäkää yhdessä": jaettu swaippaus-sessio + yksittäiset äänet.
--
-- Malli (kuten scraped_events): anon SAA lukea (RLS-policy), kirjoitukset kulkevat
-- palvelinpuolen service-role -clientillä (supabaseAdmin ohittaa RLS:n) uusien
-- julkisten /api/group/* -reittien kautta. Ei Realtimea — selain pollaa 2-3 s välein.

CREATE TABLE IF NOT EXISTS group_sessions (
  id          TEXT PRIMARY KEY,                    -- lyhyt jaettava koodi, esim. 'K7QF'
  when_filter TEXT NOT NULL DEFAULT 'tonight',     -- 'tonight' | 'day' | 'weekend'
  fiilis      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- valitut fiilikset (painotus), esim. ["ruoka","kulttuuri"]
  candidates  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- pakan snapshot (Candidate[]) luontihetkellä
  status      TEXT NOT NULL DEFAULT 'open',        -- 'open' | 'synthesizing' | 'done'
  result_plan JSONB,                               -- AI:n kutoma illan kaari (kun status='done')
  host_id     TEXT,                                -- luojan anon-tunniste (voi lukita/kutoa)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 days')
);

CREATE TABLE IF NOT EXISTS group_votes (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
  voter_id    TEXT NOT NULL,                       -- selaimen anon-tunniste (localStorage)
  voter_name  TEXT,                                -- osallistujan etunimi
  card_id     TEXT NOT NULL,                       -- Candidate.id
  vote        TEXT NOT NULL,                        -- 'love' | 'skip'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, voter_id, card_id)           -- yksi ääni per kortti per osallistuja (upsert)
);

CREATE INDEX IF NOT EXISTS idx_group_votes_session ON group_votes(session_id);

ALTER TABLE group_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_votes    ENABLE ROW LEVEL SECURITY;

-- Anon lukee (pollaus). Kirjoitukset vain service-role -clientillä (ohittaa RLS:n),
-- joten INSERT/UPDATE-policyja ei tarvita.
CREATE POLICY "Public read group_sessions" ON group_sessions FOR SELECT TO anon USING (true);
CREATE POLICY "Public read group_votes"    ON group_votes    FOR SELECT TO anon USING (true);

NOTIFY pgrst, 'reload schema';

-- Tarkistus:
-- SELECT id, when_filter, status, created_at FROM group_sessions ORDER BY created_at DESC LIMIT 5;
