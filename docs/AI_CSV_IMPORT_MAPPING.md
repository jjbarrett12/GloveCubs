# AI CSV import mapping

This document describes the AI-powered CSV import mapping system: how mapping is inferred, how profiles are reused, confidence scoring, manual override, and how AI usage is minimized for cost control.

## Overview

Admins can upload a supplier or manufacturer product CSV without manually renaming columns. The system:

1. Parses headers and a sample of rows.
2. Uses AI once per upload to infer a mapping from source columns to canonical fields.
3. Transforms all rows deterministically using that mapping.
4. Validates standardized rows (rules only; AI output does not bypass validation).
5. Feeds standardized rows into the existing ingestion pipeline (normalize → match → stage → offers).
6. Low-confidence rows or mappings are flagged for review.

## How the AI mapping works

- **Input**: CSV headers (column names) and up to 10 sample rows (values).
- **Output**: A list of mappings `{ source_column, mapped_field, confidence }`, plus `unmapped_columns` and optional `warnings`.
- **Canonical fields** include: `supplier_sku`, `manufacturer_sku`, `product_name`, `brand`, `description`, `material`, `thickness_mil`, `color`, `size`, `powder_free`, `grade`, `gloves_per_box`, `boxes_per_case`, `case_price`, `box_price`, `image_url`, and aliases expected by the existing normalizer (`name`, `title`, `sku`, `cost`, `price`, `case_qty`, `box_qty`, etc.).
- The model is prompted to map each header to exactly one canonical field and to provide a confidence score 0–1 per mapping. Unmapped columns are listed separately.
- **Single AI call per file**: Mapping is inferred once from headers + sample. All row transformation is then deterministic (copy/coerce) from source column to mapped field.

## How profiles are reused

- **Import profiles** are stored in `import_profiles` and `import_profile_fields` (schema: catalogos).
- Each profile has a **source_fingerprint**: a hash of (optional supplier_id + sorted header names). When the same supplier uploads a CSV with the same column set, the fingerprint matches.
- On upload, if `infer_mapping` is requested and a profile exists for that fingerprint (and optionally supplier), the system can **reuse the stored mapping** instead of calling AI again. The UI shows “Profile reused” when a saved profile was applied.
- **Saving a profile**: After reviewing the inferred mapping, the admin can click “Save profile for future”. The current session’s mapping is stored under a name and the fingerprint. Future uploads with the same headers (and same supplier if set) can use this profile automatically when “Upload & infer mapping” is used (reuse is applied in the upload handler when a profile is found).

## Confidence scoring

- **Per-field confidence**: Returned by the AI for each mapping (0–1). Shown in the preview table.
- **Average confidence**: Mean of all mapping confidences. Stored on the profile and in the preview session.
- **Low-confidence fields**: Any mapping with confidence below a threshold (default 0.7) is listed in the preview so the admin can review or edit (manual override – see below).
- **Rows below threshold**: A simple heuristic (e.g. rows missing required name/sku) is used to count “rows that may need review”. This is displayed in the confidence summary.
- Rows that fail validation are not imported; they are reported in the validation summary. Rows that pass validation but come from low-confidence mappings are still run through the existing pipeline; the existing pipeline’s anomaly and review flags (e.g. AI_SUGGESTED_NEEDS_REVIEW) continue to flag them where appropriate.

## Manual override

- **Edit mapping**: The preview UI shows the inferred mapping. Manual override can be implemented by allowing the admin to change the mapped field for a source column and then PATCH the preview session’s `inferred_mapping_json`. Current implementation focuses on accept/save profile; full per-column edit is a natural extension.
- **Accept and run import**: The admin clicks “Accept mapping & run import”. The full CSV is sent again with the session id and supplier id. The server uses the session’s stored mapping (which may have been edited in a future iteration), transforms all rows, validates them, and runs the existing ingestion pipeline. So “accept” means “use this mapping as-is for this import”.

## How AI usage is minimized (cost control)

1. **One AI call per upload**: Mapping is inferred once from headers + sample (or not at all if a profile is reused).
2. **Deterministic transform**: After the mapping is fixed, every row is transformed with the same rules (copy value from source column to canonical field; coerce numbers/booleans). No per-row AI.
3. **Profile reuse**: Same supplier + same column set → reuse stored profile; no AI call.
4. **Optional infer**: The admin can choose “Upload only” and then “Infer mapping (AI)” only when they want to run AI.
5. **No AI in validation**: Validation (required fields, numeric ranges, URLs, non-negative price, thickness_mil range, packaging) is rule-based only. AI output cannot bypass validation.

## Validation rules (no AI)

After transformation, standardized rows are validated:

- At least one of name/title/product_name or sku/supplier_sku/item/id.
- Price/cost non-negative and below a reasonable max.
- `thickness_mil` in 1–30 if present.
- `gloves_per_box` / `boxes_per_case` in reasonable ranges if present.
- `image_url` must be a valid URL if present.

Rows that fail validation are skipped from import and reported in the validation summary. They are not sent to the pipeline.

## Schema additions

- **import_profiles**: id, supplier_id (nullable), profile_name, source_fingerprint, status, average_confidence, created_at, updated_at.
- **import_profile_fields**: id, import_profile_id, source_column_name, mapped_field_name, transform_type, confidence, notes, created_at.
- **import_preview_sessions**: id, supplier_id (nullable), filename, headers_json, sample_rows_json, inferred_mapping_json, validation_summary_json, confidence_summary_json, status, created_at.

## Flow summary

1. **Upload CSV** → Parse headers + sample rows → Create preview session → Optionally infer mapping (AI or profile reuse).
2. **Preview** → Show columns, inferred mapping, confidence, sample rows, warnings, unmapped columns, validation summary.
3. **Actions** → Accept mapping & run import (re-send full CSV + session_id + supplier_id); or Save profile.
4. **Import** → Transform full CSV with mapping → Validate → Run existing pipeline (`runPipelineFromParsedRows`). Low-confidence or anomaly rows remain flagged in staging for review.

## Testing with one CSV

1. Go to **Dashboard → AI CSV import**.
2. Select a supplier (optional but recommended for profile reuse).
3. Paste CSV content (first row = headers).
4. Click **Upload & infer mapping**. Wait for preview.
5. Review mapping and confidence; fix supplier if needed.
6. Click **Accept mapping & run import** (keep the same CSV in the textarea). Check batch result and review queue.
7. Optionally click **Save profile for future** so the next upload with the same columns reuses this mapping without AI.

## Limitations

- Full CSV is not stored in the session; the client must re-send the CSV when running import (e.g. keep it in the textarea or re-upload).
- Per-column manual edit of mapping is not yet implemented in the UI (session’s `inferred_mapping_json` can be updated via API if needed).
- Profile match is by fingerprint (headers + optional supplier); small header changes create a new profile.
- Row limit for import is 2000 (same as the rest of the feed pipeline).
