# CatalogOS — Pricing Normalization Audit

**Scope:** Case-cost calculations, packaging conversion, price basis, negative/zero handling, rounding, publish guards, cost field consistency, packaging quantities, multi-offer comparison, ambiguous price basis.

---

## 1. Incorrect case-cost calculations

| Grade | **FAIL** |
|-------|----------|
| **Risk** | Supplier A sends price $45/case (1000/case); Supplier B sends $0.045/glove. Both are stored as raw cost (45 and 0.045). Margin is applied to the wrong basis: $45 gets 35% → $60.75 “sell” (meaningless per unit); $0.045 → $0.06. Comparing or sorting by “cost” across offers is wrong; best-price logic picks the numerically smaller value regardless of unit. |
| **Code** | Cost is taken as-is everywhere. No conversion using `case_qty` or packaging. |
| **Locations** | `normalize-service.ts` line 34: `const cost = num(row.cost ?? row.price ?? row.unit_cost ?? row.list_price);` — no division by case_qty. `normalization-utils.ts` line 95: `const cost = num(row.cost ?? ...) ?? 0;` — same. `run-pipeline.ts` line 169: `const cost = normalized.cost ?? 0;` — passes through. `staging-payload` / normalization engine use `content.supplier_cost` from `extractContentFromRaw` with no conversion. |

**Patch:**

- Define a single **cost basis** (e.g. “per unit” or “per case” with fixed case size) for the catalog.
- In normalization, if feed has `case_qty` (or `qty_per_case`) and a **price basis** (see #3), convert to that basis before setting `supplier_cost`.
- Add a helper, e.g. in `normalization-utils.ts` or a new `cost-normalize.ts`:

```ts
// cost-normalize.ts
export type CostBasis = "per_unit" | "per_case";

export function normalizeCostToBasis(params: {
  rawCost: number;
  caseQty?: number | null;
  priceBasis?: CostBasis | null;  // from raw or inferred
  targetBasis: CostBasis;
  targetCaseQty: number;  // e.g. 1000 for "per 1000 units"
}): number {
  const { rawCost, caseQty, priceBasis, targetBasis, targetCaseQty } = params;
  if (!Number.isFinite(rawCost) || rawCost < 0) return 0;
  if (!caseQty || caseQty < 1) return rawCost;  // assume already per-unit or flag
  const isPerCase = priceBasis === "per_case" || priceBasis == null;  // default infer per_case when case_qty present
  const perUnit = isPerCase ? rawCost / caseQty : rawCost;
  if (targetBasis === "per_unit") return perUnit;
  return perUnit * targetCaseQty;
}
```

- Call this before setting `supplier_cost` in `extractContentFromRaw` (or in the normalization engine after extraction), using a configured `targetBasis` and `targetCaseQty` (e.g. per 1000 units for disposable gloves).

---

## 2. Supplier feeds missing packaging conversion data

| Grade | **FAIL** |
|-------|----------|
| **Risk** | Feeds that omit `case_qty` / `qty_per_case` / `pack_size` never get cost normalized. Cost is stored as-is; if it’s per-case, it’s never converted to per-unit (or vice versa). Price filters and “best price” are wrong for those rows. |
| **Code** | `case_qty` is only used for (1) filter attribute `packaging` (extractPackaging) and (2) anomaly “conflicting case quantities”. It is never used to convert cost. `extractContentFromRaw` sets `case_qty` and `box_qty` on content but no conversion. |

**Patch:**

- When `case_qty` (or equivalent) is missing but cost is present, either:
  - **Option A:** Do not normalize cost to a common basis; set a review flag (e.g. `missing_packaging_for_cost`) and do not create a supplier_offer until resolved, or  
  - **Option B:** Assume a default (e.g. “per unit” or “per case 1000”) and set a review flag so the operator can correct.
- In the normalization path that sets `supplier_cost`, if conversion is required and `case_qty` is missing, set a flag and skip writing to `supplier_offers` for that row until packaging is present or basis is confirmed.

```ts
// In normalization-utils or staging flow, before setting supplier_cost:
if (targetCostBasis === "per_case" && !(caseQty != null && caseQty >= 1)) {
  review_flags.push({ code: "missing_packaging_for_cost", message: "case_qty missing; cost not normalized", severity: "warning" });
  // Either leave supplier_cost as raw or skip offer creation in pipeline
}
```

---

## 3. Price basis detection errors

| Grade | **FAIL** |
|-------|----------|
| **Risk** | No detection of whether the feed’s price is “per unit”, “per box”, or “per case”. Default behavior is to treat the number as-is. If the feed has a column like `unit` = "case" or `price_type` = "case", it’s ignored; wrong basis is used and conversion (once implemented) will be wrong. |
| **Code** | No `price_basis` or `unit` field is read or stored. Cost is taken from the first of `cost`, `price`, `unit_cost`, `list_price`, `supplier_cost` with no semantic. |

**Patch:**

- Add optional raw fields: e.g. `price_basis`, `unit`, `uom` in parsing/normalization.
- In `normalization-utils.ts` (and any parser output type), extend raw row type and extraction:

```ts
// extraction-types or normalization-utils
const PRICE_BASIS_KEYS = ["price_basis", "unit", "uom", "price_type", "per_unit"] as const;
function inferPriceBasis(row: Record<string, unknown>): "per_unit" | "per_case" | null {
  const raw = firstStr(row, ...PRICE_BASIS_KEYS)?.toLowerCase();
  if (!raw) return null;
  if (/\b(each|unit|ea|eaches)\b/.test(raw)) return "per_unit";
  if (/\b(case|cs|box|bx|carton)\b/.test(raw)) return "per_case";
  return null;
}
```

- Pass `inferPriceBasis(row)` into the cost normalization helper (see #1) so conversion uses the correct direction (divide vs keep).

---

## 4. Negative or zero pricing

| Grade | **WARN** |
|-------|----------|
| **Risk** | Zero cost is allowed through ingestion and into `supplier_offers`. Publish allows cost 0 and computes sell price 0; catalog “best price” can show $0. Negative cost is rejected only at publish. |
| **Code** | `anomaly-service.ts` line 38: flags `zero_or_negative_cost` but pipeline still continues and calls `createSuggestedOffer` with that cost. `publish-staging-catalogos.ts` line 79–82: `const cost = Number(norm.cost ?? 0) || 0; if (cost < 0)` — rejects negative only; zero passes. `supplier_offers` has `CHECK (cost >= 0)` so negative would fail at DB; zero is valid. `validation-modes.ts` line 96: requires `supplier_cost` to be a number but does not reject 0. |

**Patch:**

- **Ingestion:** When `cost <= 0`, do not create a supplier_offer. In `run-pipeline.ts`, only call `createSuggestedOffer` when `cost > 0` (and optionally when no `zero_or_negative_cost` anomaly):

```ts
// run-pipeline.ts, where createSuggestedOffer is called (around line 242):
if (matchingOutcome.masterProductId && matchingOutcome.confidence >= LOW_CONFIDENCE_THRESHOLD && (normalized.cost ?? 0) > 0) {
  matchedCount++;
  const offerCreated = await createSuggestedOffer({ ... });
}
```

- **Publish:** Reject staging rows with cost 0 so they cannot be published until corrected:

```ts
// publish-staging-catalogos.ts, after computing cost:
const cost = Number(norm.cost ?? 0) || 0;
if (cost < 0) {
  errors.push(`Staging ${stagingId}: invalid cost ${cost}`);
  continue;
}
if (cost === 0) {
  errors.push(`Staging ${stagingId}: zero cost not allowed for publish`);
  continue;
}
```

- **Validation:** In `validation-modes.ts`, optionally require `supplier_cost > 0` for publish-ready content, or at least add a warning when it’s 0.

---

## 5. Rounding errors in sell price

| Grade | **WARN** |
|-------|----------|
| **Risk** | Sell price is computed as `cost * (1 + margin/100)` then `Math.round(value * 100) / 100`. Float arithmetic (e.g. 10.1 + 20.2) can produce 30.299999999999997; rounding is correct for that single value but repeated operations can accumulate. No use of decimal library; edge cases with very small or very large costs possible. |
| **Code** | `pricing-service.ts` line 84–86: `function roundCommercial(value: number): number { if (!Number.isFinite(value) || value < 0) return 0; return Math.round(value * 100) / 100; }` |

**Patch:**

- Keep current rounding for typical currency; document that cost/sell are expected in normal currency range.
- For strict consistency, use a decimal library (e.g. `decimal.js`) for the chain `cost * (1 + pct/100)` and then round to 2 decimals, and use the same in `review/data.ts` for the inline `cost * 1.35` display:

```ts
// pricing-service.ts
import Decimal from "decimal.js";
function roundCommercial(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
// and when computing sell: new Decimal(input.cost).times(1 + pct/100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
```

- If not adding a dependency, at least ensure all sell calculations go through `roundCommercial` and that cost is validated as finite before use.

---

## 6. Publish proceeding despite missing conversion data

| Grade | **FAIL** |
|-------|----------|
| **Risk** | Rows with no `case_qty` or ambiguous price basis are published with whatever cost is in `normalized_data`. That cost may be per-case while the catalog expects per-unit (or vice versa), so live products get wrong prices and comparison with other offers is invalid. |
| **Code** | `publish-staging-catalogos.ts` uses `norm.cost` only; no check for `case_qty`, `price_basis`, or conversion flags. No guard that cost was normalized. |

**Patch:**

- Add a required or strongly-recommended rule: “publish only when cost is normalized to the standard basis” (e.g. per 1000 units or per unit).
- Option A: Store a `cost_normalized: boolean` or `cost_basis` on normalized_data during ingestion (set when conversion ran and case_qty/basis was present). In publish, reject when not set:

```ts
// publish-staging-catalogos.ts
const costNormalized = (norm as { cost_normalized?: boolean }).cost_normalized;
if (!costNormalized && (norm.cost ?? 0) > 0) {
  errors.push(`Staging ${stagingId}: cost not normalized (missing packaging or price basis)`);
  continue;
}
```

- Option B: Require `case_qty` (or equivalent) on normalized_data for publish when cost &gt; 0, and reject otherwise so operators fix data before publish.

---

## 7. Conflicts between normalized_case_cost and supplier_offers cost fields

| Grade | **WARN** |
|-------|----------|
| **Risk** | Schema has no `normalized_case_cost`; there is a single `cost` on `supplier_offers` and `supplier_cost` (and `cost` on normalized_data) with no basis. So there’s no second field to “conflict” with, but the single cost is ambiguous: it’s unclear whether it’s per unit, per case, or per box. Once you add normalization (e.g. “normalized cost per 1000 units”), storing only one number in `supplier_offers` without a basis can conflict with display or comparison if some rows are later interpreted as “per case” and others “per unit”. |
| **Code** | `supplier_offers` (schema): `cost NUMERIC(12,4) NOT NULL` only. No `case_qty`, `cost_basis`, or `normalized_case_cost`. Normalized_data has `supplier_cost` and optional `case_qty` but no `cost_basis`. |

**Patch:**

- Add a **cost basis** column to `supplier_offers` so all offers are comparable:

```sql
-- Migration
ALTER TABLE catalogos.supplier_offers
  ADD COLUMN cost_basis TEXT DEFAULT 'per_unit' CHECK (cost_basis IN ('per_unit', 'per_case'));
-- Optional: add case_qty for the offer so "per case" is interpretable
ALTER TABLE catalogos.supplier_offers
  ADD COLUMN case_qty INT CHECK (case_qty IS NULL OR case_qty >= 1);
```

- When creating/upserting offers, set `cost_basis` (and optionally `case_qty`) from the normalized row so catalog and “best price” logic can compare only like-to-like (e.g. normalize to per-unit in the query when comparing).

---

## 8. Inconsistent packaging quantities (e.g. 1000 each per case but 12 boxes of 100)

| Grade | **WARN** |
|-------|----------|
| **Risk** | Feeds with “12 boxes × 100” only provide one quantity in a single field (e.g. 100 or 1200); the other dimension is lost. Extractors use one number for packaging bucket (e.g. box_100_ct vs case_1000_ct). Two feeds for the same product could be “1000/case” vs “12×100” and end up with different packaging values and no shared way to normalize cost (e.g. 1000 vs 1200 units per case). |
| **Code** | `extract-filters.ts` line 186: `const qty = num(row.case_qty ?? row.qty_per_case ?? row.box_qty) ?? num(row.pack_size);` — single numeric value. No parsing of “12 x 100” or “12 boxes of 100”. `extractPackaging` maps that one number to a bucket (e.g. ≥1000 → case_1000_ct). |

**Patch:**

- Support composite packaging in raw/normalized: e.g. `boxes_per_case` and `units_per_box`, or `units_per_case` derived. Extend parsing to detect patterns like “12x100”, “12 boxes of 100”, “1000/case” and set both dimensions where possible.
- In cost normalization, use `units_per_case = boxes_per_case * units_per_box` when available so “12 boxes of 100” → 1200 units per case and cost can be converted consistently.

```ts
// extract-filters or normalization: parse "12 x 100" style
function parseCompositePackaging(row: RawRow): { unitsPerCase?: number; boxesPerCase?: number; unitsPerBox?: number } {
  const text = combinedText(row);
  const m = text.match(/(\d+)\s*(?:x|×|boxes?)\s*(\d+)/i) || text.match(/(\d+)\s*\/\s*case/i);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : null;
    if (b != null) return { boxesPerCase: a, unitsPerBox: b, unitsPerCase: a * b };
    return { unitsPerCase: a };
  }
  return {};
}
```

- Store `units_per_case` (or equivalent) and use it in cost conversion instead of only a single `case_qty` when both are present.

---

## 9. Multiple supplier offers with mismatched case quantities

| Grade | **FAIL** |
|-------|----------|
| **Risk** | Catalog “best price” uses `Math.min(...costs)` over `supplier_offers.cost`. If Offer 1 is $45/case (1000) and Offer 2 is $12/box (100), stored as cost 45 and 12; the system shows “best” as 12. Per unit, 45/1000 = $0.045 and 12/100 = $0.12, so the true best is Offer 1. Ranking and filtering by price are wrong. |
| **Code** | `catalogos/src/lib/catalog/query.ts` lines 96–101, 125–130, 157–165, 208–217: `minCostByProduct` / `bestPriceByProduct` built by taking the minimum `cost` across offers. No `case_qty` or basis; raw numeric comparison only. Same in `facets.ts` (min/max cost from offers). |

**Patch:**

- Normalize all offer costs to a single basis at write time (see #1 and #7). Store only normalized cost (e.g. per 1000 units) in `supplier_offers.cost` and set `cost_basis` (and optionally `case_qty`) so that “best price” is comparing like-to-like.
- If keeping mixed bases, do not compare raw `cost`; in query layer compute “per unit” (or “per 1000”) using `case_qty` and then compare. That requires `case_qty` (or equivalent) on `supplier_offers` and a consistent rule for missing values (e.g. exclude from min or assume a default and flag).

---

## 10. Edge cases where supplier price basis is ambiguous

| Grade | **FAIL** |
|-------|----------|
| **Risk** | When the feed has no `unit`/`price_basis` and has both a price and a case_qty, the system cannot know if the price is per case or per unit. Guessing wrong doubles or halves the effective cost and corrupts margins and comparisons. |
| **Code** | No inference or storage of price basis. `extractContentFromRaw` and `buildNormalizedFromRaw` only read numeric cost; no semantic. |

**Patch:**

- Implement price-basis detection (see #3). When basis is ambiguous (e.g. `case_qty` present but no `unit`), set a review flag and do not normalize cost (or assume one convention and flag):

```ts
// After inferPriceBasis(row)
const basis = inferPriceBasis(row);
const caseQty = num(row.case_qty ?? row.qty_per_case ?? ...);
if (caseQty != null && caseQty >= 1 && basis == null) {
  review_flags.push({
    code: "ambiguous_price_basis",
    message: "case_qty present but price basis (per_unit/per_case) unknown; cost may be wrong",
    severity: "warning",
  });
}
```

- Optionally infer heuristics (e.g. if cost is much larger than typical per-unit, assume per-case) but always surface as a warning so an operator can confirm.

---

## Summary table

| # | Issue | Grade | Main risk |
|---|--------|-------|-----------|
| 1 | Incorrect case-cost calculations | FAIL | No conversion; wrong margins and comparisons |
| 2 | Missing packaging conversion data | FAIL | Cost never normalized when case_qty missing |
| 3 | Price basis detection errors | FAIL | No basis; conversion (if added) will be wrong |
| 4 | Negative or zero pricing | WARN | Zero allowed into offers and publish |
| 5 | Rounding errors in sell price | WARN | Float edge cases; no decimal library |
| 6 | Publish despite missing conversion | FAIL | Wrong prices published |
| 7 | normalized_case_cost vs supplier_offers | WARN | Single ambiguous cost field |
| 8 | Inconsistent packaging quantities | WARN | No composite “12×100” handling |
| 9 | Multiple offers mismatched case qty | FAIL | Best-price comparison invalid |
| 10 | Ambiguous supplier price basis | FAIL | No detection; wrong conversion risk |

---

## Recommended order of patches

1. **#3 + #1:** Add price-basis detection and a single cost-normalization path to a defined basis (e.g. per 1000 units).
2. **#7:** Add `cost_basis` (and optionally `case_qty`) to `supplier_offers` and set them when creating offers.
3. **#2 + #6:** Flag missing packaging when conversion is needed; block publish when cost is not normalized (or packaging missing when cost &gt; 0).
4. **#4:** Block zero cost at offer creation and at publish.
5. **#9:** Ensure catalog “best price” uses normalized cost only (after #1/#7).
6. **#10:** Add ambiguous-price-basis flag when case_qty present but basis unknown.
7. **#8:** Optional: composite packaging parsing for “12×100” and store units_per_case.
8. **#5:** Optional: decimal library for sell-price rounding.
