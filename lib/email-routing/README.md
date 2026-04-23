# AI Email Routing (GloveCubs)

Monitors a Gmail inbox, classifies incoming emails with OpenAI, triggers intent-based actions, and stores results for audit. Outbound replies can be held in a **review queue** for human approval before sending.

## Intents

| Intent | Action |
|--------|--------|
| `CUSTOMER_PRODUCT_QUESTION` | Query catalog API, draft response (review before send) |
| `SUPPLIER_ONBOARDING` | Send vendor onboarding instructions (review before send) |
| `SUPPLIER_CATALOG_SUBMISSION` | Detect attachment, send to CatalogOS ingestion endpoint |
| `RFQ_RESPONSE` | Attach to RFQ record |
| `GENERAL_SUPPORT` | Create support ticket, draft acknowledgment (review before send) |
| `SPAM` | No reply |

## Environment

```env
# Gmail API (OAuth2 – use a refresh token from OAuth playground or app)
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...

# OpenAI (classification + draft generation)
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMAIL_CLASSIFIER_MODEL=gpt-4o-mini

# Supabase (audit + review queue)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Optional
APP_URL=http://localhost:3004
SUPPLIER_ONBOARDING_URL=https://...
SUPPLIER_ONBOARDING_TEMPLATE=...
CATALOGOS_INGEST_URL=https://.../api/ingest
```

## Gmail OAuth setup

1. Create a project in Google Cloud Console, enable **Gmail API**.
2. Create OAuth 2.0 credentials (Desktop or Web).
3. Use the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) (or a small script) to get a **refresh token** for the Gmail scope `https://www.googleapis.com/auth/gmail.readonly` (and `gmail.modify` if you later want to mark read).
4. Set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` in `.env`.

## Database

Run the Supabase migration:

```bash
# Apply migration (path may vary by setup)
supabase db push
# or run supabase/migrations/20260320000001_email_routing.sql manually
```

Tables: `email_routing_messages`, `email_routing_classifications`, `email_routing_actions`.

## Worker

Process unread inbox messages once:

```bash
npm run email-routing:worker
```

Or with options:

```bash
node lib/email-routing/worker.js --once --max=20
```

Schedule this (cron, PM2, etc.) to run every few minutes.

## Review queue API (admin)

All routes require `authenticateToken` + `requireAdmin`.

- `GET /api/email-routing/review` – list actions with `status: pending_review`
- `GET /api/email-routing/review/:id` – get one action with message and classification
- `POST /api/email-routing/review/:id/approve` – mark approved (ready to send)
- `POST /api/email-routing/review/:id/reject` – reject
- `POST /api/email-routing/review/:id/send` – send the approved reply (uses existing SMTP from `lib/email`)

## Flow

1. **Worker** polls Gmail for unread messages, skips already-processed (by `gmail_message_id`).
2. **Classifier** (OpenAI) returns intent + confidence.
3. **Handler** runs per intent (draft reply, onboarding template, catalog submission stub, RFQ stub, support ticket, spam).
4. **Audit**: message, classification, and action are stored in Supabase.
5. Actions that need human review stay in `pending_review`; admin can approve then send via API.
