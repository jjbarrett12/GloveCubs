-- WS10: Company invitations for admin-initiated buyer onboarding
-- Uniqueness is status-based (pending only). No time-dependent index predicates.

CREATE TABLE IF NOT EXISTS gc_commerce.company_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES gc_commerce.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending',
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID,
  invited_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT company_invitations_valid_role
    CHECK (role IN ('owner', 'admin', 'member', 'viewer', 'billing')),
  CONSTRAINT company_invitations_valid_status
    CHECK (status IN ('pending', 'expired', 'revoked', 'accepted')),
  CONSTRAINT company_invitations_expires_after_create
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_company_invitations_company_id
  ON gc_commerce.company_invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_company_invitations_email_normalized
  ON gc_commerce.company_invitations(email_normalized);
CREATE INDEX IF NOT EXISTS idx_company_invitations_token_hash
  ON gc_commerce.company_invitations(token_hash);

-- At most one pending invite per company + normalized email.
-- Expired/revoked/accepted rows leave this set; no now() in the predicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_invitations_pending_unique
  ON gc_commerce.company_invitations(company_id, email_normalized)
  WHERE status = 'pending';

COMMENT ON TABLE gc_commerce.company_invitations IS
  'Invitations for buyers to join a company. Token is hashed; raw token shown once at creation/reissue.';
COMMENT ON COLUMN gc_commerce.company_invitations.token_hash IS
  'SHA-256 hash of the invitation token. Raw token is never stored.';
COMMENT ON COLUMN gc_commerce.company_invitations.email_normalized IS
  'lower(trim(email)) used for exact uniqueness and lookups.';
COMMENT ON COLUMN gc_commerce.company_invitations.status IS
  'pending | expired | revoked | accepted. Only pending participates in unique (company, email).';
COMMENT ON COLUMN gc_commerce.company_invitations.expires_at IS
  'Invitation expires after this timestamp. Creation path marks status=expired when past.';

ALTER TABLE gc_commerce.company_invitations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE gc_commerce.company_invitations FROM PUBLIC;
GRANT ALL ON TABLE gc_commerce.company_invitations TO service_role;

-- Exact case-insensitive orphan quote linkage (equality on lower(trim(email)); no pattern operators).
CREATE OR REPLACE FUNCTION catalogos.gc_link_orphan_quote_requests_by_email(
  p_email text,
  p_company_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = catalogos, gc_commerce, pg_temp
AS $$
DECLARE
  v_email text := lower(trim(both FROM coalesce(p_email, '')));
  v_ids uuid[];
  v_count int;
BEGIN
  IF v_email IS NULL OR v_email = '' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_not_found' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM gc_commerce.companies c WHERE c.id = p_company_id
  ) THEN
    RAISE EXCEPTION 'company_not_found' USING ERRCODE = '22023';
  END IF;

  -- When caller supplies a user, require membership in the target company.
  IF p_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM gc_commerce.company_members cm
      WHERE cm.company_id = p_company_id
        AND cm.user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'membership_required' USING ERRCODE = '42501';
    END IF;
  END IF;

  WITH updated AS (
    UPDATE catalogos.quote_requests qr
    SET gc_company_id = p_company_id
    WHERE lower(trim(both FROM qr.email)) = v_email
      AND qr.gc_company_id IS NULL
    RETURNING qr.id
  )
  SELECT coalesce(array_agg(u.id), ARRAY[]::uuid[]), count(*)::int
  INTO v_ids, v_count
  FROM updated u;

  RETURN jsonb_build_object(
    'linked_count', v_count,
    'linked_ids', to_jsonb(coalesce(v_ids, ARRAY[]::uuid[]))
  );
END;
$$;

REVOKE ALL ON FUNCTION catalogos.gc_link_orphan_quote_requests_by_email(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION catalogos.gc_link_orphan_quote_requests_by_email(text, uuid, uuid) TO service_role;

COMMENT ON FUNCTION catalogos.gc_link_orphan_quote_requests_by_email(text, uuid, uuid) IS
  'Links unowned quote_requests to a company by exact lower(trim(email)) equality. Optional p_user_id enforces membership. Does not use pattern matching.';
