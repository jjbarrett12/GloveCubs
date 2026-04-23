# Quote / RFQ Flow for Buyers

## Goal

Turn catalog traffic into buyer inquiries and quote requests. B2B-first: no consumer checkout; buyers add products to a quote basket and submit an RFQ with company/contact details.

## Architecture

- **Basket**: Client-side only until submission. React context + localStorage for persistence across pages. Items: product id, slug, name, quantity, notes, optional snapshot (price, sku).
- **Submission**: Server action validates payload (zod), creates `quote_requests` row, creates `quote_line_items` rows, optionally stores file uploads; returns quote id and redirects to confirmation.
- **Admin**: Dashboard list and detail for quote requests; status workflow (new → reviewing → contacted → quoted → closed).
- **Product integration**: "Add to quote list" on catalog grid and PDP; "Request quote" on PDP adds current product and can go to quote page. Quote list page shows basket + request form.

## Schema (catalogos)

- **quote_requests**: id, company_name, contact_name, email, phone, notes, urgency, status, created_at, updated_at, reference_number (optional display id).
- **quote_line_items**: id, quote_request_id, product_id, quantity, notes, product_snapshot (jsonb: name, slug, sku, unit_price if needed for history).
- **quote_files**: id, quote_request_id, storage_key, filename, content_type, created_at (optional uploads).

## Security / Validation

- **Server-side**: `submitQuoteRequestSchema` (zod) validates company_name, contact_name, email, phone, notes, urgency, items (productId, slug, name, quantity, notes). Items min 1, max 100. Strings trimmed and length-capped.
- **Product IDs**: Line items reference `catalogos.products(id)`; FK ensures only valid product IDs. Snapshot stores name/slug at submit time for display.
- **No auth** for storefront submission; consider rate limiting by IP or email and optional CAPTCHA in production to prevent abuse.
- **Admin**: Quote list and detail live under dashboard; protect with existing dashboard auth (middleware or layout).
- **Basket**: Client-only (localStorage); no PII until submit. Clearing basket does not touch server.
