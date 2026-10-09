-- =============================================================================
-- Phase 1: password_reset_tokens — store digests only; revoke API access; RLS.
-- Adds token_hash; clears plaintext token column for existing rows.
-- Application must write token_hash (SHA-256 hex) and stop selecting plaintext.
-- Rollback: re-enable SELECT for service_role only (never anon); restore app to
--   plaintext only if emergency (not recommended).
-- =============================================================================

ALTER TABLE public.password_reset_tokens
  ADD COLUMN IF NOT EXISTS token_hash TEXT;

ALTER TABLE public.password_reset_tokens
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_tokens_token_hash
  ON public.password_reset_tokens (token_hash)
  WHERE token_hash IS NOT NULL;

COMMENT ON COLUMN public.password_reset_tokens.token_hash IS
  'SHA-256 hex digest of the one-time reset token. Raw token must not be stored.';

COMMENT ON COLUMN public.password_reset_tokens.consumed_at IS
  'Set when token is successfully used; reuse must fail.';

-- Scrub any historical plaintext tokens (cannot recover — users re-request reset).
UPDATE public.password_reset_tokens
SET token = ''
WHERE token IS NOT NULL AND token <> '';

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated → deny. service_role bypasses RLS.

REVOKE ALL ON TABLE public.password_reset_tokens FROM anon;
REVOKE ALL ON TABLE public.password_reset_tokens FROM authenticated;
REVOKE ALL ON TABLE public.password_reset_tokens FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.password_reset_tokens TO service_role, postgres;
