-- AI Email Routing: inbox events, classifications, and action queue for audit and human review.
-- Requires Supabase (public schema).

CREATE TABLE IF NOT EXISTS email_routing_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT,
  from_email TEXT NOT NULL,
  to_email TEXT,
  subject TEXT,
  snippet TEXT,
  body_plain TEXT,
  body_html TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  has_attachments BOOLEAN NOT NULL DEFAULT false,
  attachment_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_email_routing_messages_gmail_id ON email_routing_messages (gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_email_routing_messages_received ON email_routing_messages (received_at DESC);

COMMENT ON TABLE email_routing_messages IS 'Incoming emails fetched from Gmail for AI routing.';

CREATE TABLE IF NOT EXISTS email_routing_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES email_routing_messages(id) ON DELETE CASCADE,
  intent TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL,
  raw_ai_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_routing_classifications_message ON email_routing_classifications (message_id);
CREATE INDEX IF NOT EXISTS idx_email_routing_classifications_intent ON email_routing_classifications (intent);

COMMENT ON TABLE email_routing_classifications IS 'AI intent classification per message (CUSTOMER_PRODUCT_QUESTION, SUPPLIER_ONBOARDING, etc.).';

CREATE TABLE IF NOT EXISTS email_routing_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES email_routing_messages(id) ON DELETE CASCADE,
  classification_id UUID REFERENCES email_routing_classifications(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('DRAFT_RESPONSE', 'SEND_ONBOARDING', 'CATALOG_SUBMISSION', 'ATTACH_TO_RFQ', 'CREATE_SUPPORT_TICKET', 'MARK_SPAM', 'NONE')),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'sent', 'failed')),
  draft_subject TEXT,
  draft_body TEXT,
  external_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  reviewed_by TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_routing_actions_message ON email_routing_actions (message_id);
CREATE INDEX IF NOT EXISTS idx_email_routing_actions_status ON email_routing_actions (status);
CREATE INDEX IF NOT EXISTS idx_email_routing_actions_created ON email_routing_actions (created_at DESC);

COMMENT ON TABLE email_routing_actions IS 'Actions triggered by intent; pending_review requires human approval before send.';
