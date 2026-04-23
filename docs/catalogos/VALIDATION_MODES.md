# CatalogOS Validation Modes

Validation is split into three explicit levels to remove ambiguity between "can stage" and "can publish" and to separate structure/allowed-value checks from requirement checks.

## 1. parse_safe

**Purpose:** Validates **structure** and **allowed dictionary values** only. Does not require required attributes to be present.

**Use when:** Checking that extracted/normalized data has valid shape and that every attribute value present is in the attribute dictionary (e.g. before staging or when accepting API input).

**API:** `parseSafe({ content, category_slug, filter_attributes })` → `{ valid: boolean, errors: string[] }`

**Checks:**
- `content.canonical_title`, `content.supplier_sku`, `content.supplier_cost` required and valid
- `category_slug` is one of `disposable_gloves` | `reusable_work_gloves`
- `filter_attributes` is an object
- For each key in `filter_attributes`, value(s) are in the allowed set for that attribute (from dictionary). Brand is free text (non-empty string).

**Does not check:** Whether required attributes for the category are present.

---

## 2. stage_safe

**Purpose:** Allows missing required attributes; generates **blocking review flags** and keeps status **pending**. Always allows staging.

**Use when:** Building the normalization result and review flags. Missing required attributes produce error-level flags; missing strongly preferred produce warning-level flags. Rows are always stageable; status stays pending until required are satisfied (and admin approves).

**API:** `stageSafe(categorySlug, filterAttributes)` → `{ stageable: true, missing_required: string[], missing_strongly_preferred: string[] }`

**Checks:** Same requirement levels as `validateAttributesByCategory` (required vs strongly_preferred per category).

**Does not block:** Staging always proceeds. Caller adds review flags from `missing_required` and `missing_strongly_preferred`.

---

## 3. publish_safe

**Purpose:** **Blocks publish** when required attributes are missing or invalid.

**Use when:** Immediately before publishing (e.g. in `runPublish`). If `publishable` is false, publish returns an error and does not run.

**API:** `publishSafe(categorySlug, filterAttributes)` → `{ publishable: boolean, error?: string }`

**Checks:** Same requirement levels as stage_safe. `publishable === false` when any required attribute for the category is missing.

---

## Flow

1. **Ingestion / normalization:** After extraction, run **parse_safe** (optional) to reject or flag rows with invalid structure or non-dictionary values. Run **stage_safe** to get `missing_required` / `missing_strongly_preferred` and attach as review flags. Rows are always staged with status `pending`.
2. **Review:** Admin sees flags from stage_safe (missing_required = blocking, missing_strongly_preferred = warning). Admin can fix attributes and re-run.
3. **Publish:** Before publishing, run **publish_safe**. If not publishable, return error and do not publish.

## Relationship to legacy APIs

- **validateAttributesByCategory** is the low-level requirement check used by both `stageSafe` and `publishSafe`. Prefer `stageSafe` / `publishSafe` so intent (stage vs publish) is explicit.
- **validateNormalizedPayload** (staging-payload) now uses **parse_safe** under the hood: it validates structure and allowed values only, and does not require required attributes to be present. Use **publish_safe** separately when you need to assert "ready to publish."
