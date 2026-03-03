-- Find My Glove: document RLS for glove_reco_sessions.
-- Anon can INSERT only; no SELECT policy exists so anon cannot read.
-- Service role (backend) bypasses RLS and can read if needed.
COMMENT ON TABLE glove_reco_sessions IS 'Recommendation session logs. RLS: INSERT only for anon; no SELECT policy (anon cannot read).';
