-- WS10: Company invitations for admin-initiated buyer onboarding

CREATE TABLE IF NOT EXISTS gc_commerce.company_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES gc_commerce.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID,
  invited_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'member', 'viewer', 'billing')),
  CONSTRAINT expires_in_future CHECK (expires_at > created_at)
);

CREATE INDEX idx_company_invitations_company_id ON gc_commerce.company_invitations(company_id);
CREATE INDEX idx_company_invitations_email ON gc_commerce.company_invitations(email);
CREATE INDEX idx_company_invitations_token_hash ON gc_commerce.company_invitations(token_hash);

-- Unique constraint: one active (not revoked, not accepted, not expired) invite per email+company
CREATE UNIQUE INDEX idx_company_invitations_active_unique
  ON gc_commerce.company_invitations(company_id, lower(email))
  WHERE revoked_at IS NULL AND accepted_at IS NULL AND expires_at > now();

COMMENT ON TABLE gc_commerce.company_invitations IS 'Invitations for buyers to join a company. Token is hashed; raw token shown once at creation.';
COMMENT ON COLUMN gc_commerce.company_invitations.token_hash IS 'SHA-256 hash of the invitation token. Raw token is never stored.';
COMMENT ON COLUMN gc_commerce.company_invitations.expires_at IS 'Invitation expires after this timestamp. Default is 7 days from creation.';
COMMENT ON COLUMN gc_commerce.company_invitations.revoked_at IS 'If set, invitation was manually revoked by an admin.';
COMMENT ON COLUMN gc_commerce.company_invitations.accepted_at IS 'If set, invitation was accepted and membership created.';
COMMENT ON COLUMN gc_commerce.company_invitations.accepted_user_id IS 'Auth user ID who accepted the invitation.';

ALTER TABLE gc_commerce.company_invitations ENABLE ROW LEVEL SECURITY;

-- Service-role / admin APIs only; no authenticated buyer policies (invite accept uses service role).
REVOKE ALL ON TABLE gc_commerce.company_invitations FROM PUBLIC;
GRANT ALL ON TABLE gc_commerce.company_invitations TO service_role;
