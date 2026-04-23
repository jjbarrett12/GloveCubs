# Case-Cost Pricing (GloveCubs CatalogOS)

GloveCubs sells by the **case** only. Supplier feeds may provide pricing in box, pack, each, or other units. All supplier pricing is normalized to **case cost** before markup and sell price are applied.

## Data model (normalized_data)

Staged and normalized rows carry these pricing fields (in `normalized_data` and `content`):

| Field | Description |
|-------|-------------|
| `supplier_price_amount` | Raw price from feed (per unit of basis). |
| `supplier_price_basis` | Parsed basis: `each`, `pair`, `pack`, `box`, `carton`, `case`. |
| `sell_unit` | Always `"case"`. |
| `boxes_per_case` | For box→case conversion. |
| `packs_per_case` | For pack→case conversion. |
| `eaches_per_box` | Eaches per box (optional). |
| `eaches_per_case` | Eaches per case (for each→case). |
| `normalized_case_cost` | **Case cost** after conversion; used for markup and sell price. |
| `computed_case_qty` | Case quantity used in conversion (e.g. from packaging). |
| `pricing_confidence` | 0–1; 1 = confident conversion. |
| `pricing_notes` | Human-readable notes (e.g. "Missing boxes_per_case"). |
| `conversion_formula` | Display string (e.g. "$10/box × 10 boxes/case = $100/case"). |

`supplier_cost` in content is set to `normalized_case_cost` when available, so downstream (pricing service, staging, publish) always sees case cost.

## Normalization

- **Ingestion** parses `price_per`, `unit`, `uom`, `case_price`, `case_qty`, `boxes_per_case`, `packs_per_case`, `eaches_per_case`, etc. from raw rows.
- **Case-cost module** (`@/lib/pricing/case-cost-normalization`) computes `normalized_case_cost` and sets review flags when conversion cannot be done.

## Conversion rules

- **case** → pass-through.
- **box** → `normalized_case_cost = supplier_price_amount × boxes_per_case` (requires `boxes_per_case`).
- **each** → `normalized_case_cost = supplier_price_amount × eaches_per_case` (requires `eaches_per_case` or `case_qty`).
- **pair** → same as each with units = `eaches_per_case / 2`.
- **pack** → `normalized_case_cost = supplier_price_amount × packs_per_case` (requires `packs_per_case`).
- **carton** → treated like box with optional multiplier.

## Review flags

| Code | Severity | When |
|------|----------|------|
| `missing_case_conversion_data` | error | Basis is box/pack/each but required packaging field missing. |
| `ambiguous_price_basis` | warning | Basis could not be determined; treating as case. |
| `inconsistent_case_quantity` | warning | eaches_per_box × boxes_per_case ≠ eaches_per_case. |
| `invalid_supplier_price` | error | Negative, missing, or non-finite price. |

## Publish validation

- When `sell_unit === "case"` and `normalized_case_cost` is null or invalid, **publish is blocked** with a clear error.
- Offer cost and sell price are always derived from **normalized case cost** (or override), never from raw box/each price.

## Review UI

Staged product detail shows:

- Price basis and supplier amount.
- Conversion formula (if any).
- Normalized case cost.
- Final sell price (override or from case cost + markup).
- Pricing confidence.

## Files

- `catalogos/src/lib/pricing/case-cost-normalization.ts` – conversion and flags.
- `catalogos/src/lib/normalization/normalization-engine.ts` – runs case-cost normalization and merges into content.
- `catalogos/src/lib/publish/publish-service.ts` – uses `normalized_case_cost`, blocks when unavailable.
- `catalogos/src/components/review/StagedProductDetail.tsx` – pricing section in review UI.
