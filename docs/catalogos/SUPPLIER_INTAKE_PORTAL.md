# Supplier-Facing Intake and Onboarding Portal

## Goal

Allow suppliers to submit and update onboarding information directly via a public portal. Internal team can request more info; suppliers return via a tokenized link to provide updates and files. No full account system required.

## Architecture

- **Public intake** (`/supplier-intake`): Form submits company, contact, categories, feed type/URL, notes. Creates `supplier_onboarding_requests` with `submitted_via = 'supplier_portal'`, generates an **access token**, redirects to status page.
- **Tokenized access**: Each request can have a unique `access_token` (long random string) and optional `access_token_expires_at`. Status page and “update info” are only accessible with a valid token (query or path). No login required.
- **Status page** (`/supplier-intake/status/[token]`): Supplier sees current status and, when status is `waiting_for_supplier`, sees `requested_info_notes` and can submit updates and file uploads.
- **Request more info**: Admin sets status to `waiting_for_supplier` and sets `requested_info_notes`. Supplier uses same token link to return and respond.
- **Files**: Stored in Supabase Storage bucket `supplier-onboarding`, path `{request_id}/{file_id}_{sanitized_filename}`. Metadata in `supplier_onboarding_files`. Upload/list/replace via server actions; download via signed URLs or server proxy.

## Schema Additions

- `supplier_onboarding_requests`: `access_token` (TEXT UNIQUE), `access_token_expires_at` (TIMESTAMPTZ), `requested_info_notes` (TEXT), `submitted_via` ('admin' | 'supplier_portal').
- Storage: Supabase Storage bucket `supplier-onboarding` (private); create via dashboard or API.

## Security Notes

- **Token**: Unguessable (32 bytes hex). Treat as secret; share only via secure channel (e.g. email). Optional expiry (default 90 days) limits exposure.
- **Public routes**: `/supplier-intake` and `/supplier-intake/status/[token]` do not require auth. Add rate limiting and optional CAPTCHA in production.
- **File upload**: Content type and size validated server-side (e.g. PDF, CSV, 50 MB max). Files stored in private bucket; download via short-lived signed URLs.
- **Status updates by token**: Suppliers can only update their own request (validated by token); cannot change status. Admin actions remain behind dashboard auth.
- **Storage bucket**: Create bucket `supplier-onboarding` in Supabase Dashboard (Storage) and set to private. RLS can restrict access; server uses service role for upload/signed URL.
