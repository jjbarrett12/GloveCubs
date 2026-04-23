/**
 * Normalize supplier pricing to case cost before sell price is calculated.
 * GloveCubs sells by the case only; box/pack/each pricing must be converted to case cost.
 */

import type { ReviewFlag } from "@/lib/normalization/types";

export const SELL_UNIT = "case" as const;

export type PriceBasis = "each" | "pair" | "pack" | "box" | "carton" | "case";

export interface PricingNormalizationInput {
  /** Raw row from supplier feed. */
  raw: Record<string, unknown>;
  /** Already-extracted content (supplier_cost, case_qty, box_qty from normalization-utils). */
  supplier_cost?: number;
  case_qty?: number;
  box_qty?: number;
}

export interface PricingNormalizationResult {
  /** Original price amount from supplier (per unit of basis). */
  supplier_price_amount: number;
  /** Parsed basis: each, pair, pack, box, carton, case. */
  supplier_price_basis: PriceBasis;
  sell_unit: typeof SELL_UNIT;
  boxes_per_case: number | null;
  packs_per_case: number | null;
  eaches_per_box: number | null;
  eaches_per_case: number | null;
  /** Computed case quantity used in conversion (e.g. from packaging). */
  computed_case_qty: number | null;
  /** Case cost after conversion; use this for markup/sell price. */
  normalized_case_cost: number | null;
  /** 0–1; 1 = confident conversion. */
  pricing_confidence: number;
  pricing_notes: string[];
  flags: ReviewFlag[];
  /** For display: formula used (e.g. "$10/box × 10 boxes/case = $100/case"). */
  conversion_formula?: string;
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim().toLowerCase();
}

/**
 * Parse price basis from raw row (price_per, unit, uom, case_price, etc.).
 */
function parsePriceBasis(raw: Record<string, unknown>): { basis: PriceBasis; amount: number } | null {
  const amount = num(raw.cost ?? raw.price ?? raw.unit_cost ?? raw.list_price ?? raw.supplier_cost ?? raw.case_price ?? raw.price_per_case);
  if (amount == null || amount < 0) return null;

  const casePrice = num(raw.case_price ?? raw.price_per_case ?? raw.cost_per_case);
  if (casePrice != null && casePrice >= 0) {
    return { basis: "case", amount: casePrice };
  }

  const per = str(raw.price_per ?? raw.unit ?? raw.uom ?? raw.sell_unit ?? raw.pricing_unit ?? "");
  const byKey: Record<string, PriceBasis> = {
    each: "each",
    ea: "each",
    eaches: "each",
    pair: "pair",
    pr: "pair",
    pairs: "pair",
    pack: "pack",
    pk: "pack",
    packs: "pack",
    box: "box",
    bx: "box",
    boxes: "box",
    carton: "carton",
    ct: "carton",
    case: "case",
    cs: "case",
    cases: "case",
  };
  const basis = byKey[per] ?? (raw.case_qty != null || raw.caseqty != null ? "case" : null);
  if (basis) return { basis, amount };

  const caseQty = num(raw.case_qty ?? raw.caseqty ?? raw.qty_per_case);
  if (caseQty != null && caseQty > 0 && amount >= 0) {
    return { basis: "each", amount };
  }
  /** No explicit basis (price_per, case_price, case_qty); caller will assume case and flag ambiguous. */
  return null;
}

/**
 * Parse packaging structure: boxes per case, eaches per box, etc.
 */
function parsePackaging(raw: Record<string, unknown>): {
  boxes_per_case: number | null;
  packs_per_case: number | null;
  eaches_per_box: number | null;
  eaches_per_case: number | null;
  case_qty: number | null;
} {
  const case_qty = num(raw.case_qty ?? raw.caseqty ?? raw.qty_per_case ?? raw.pack_qty ?? raw.pack_size) ?? null;
  const box_qty = num(raw.box_qty ?? raw.boxqty ?? raw.qty_per_box ?? raw.gloves_per_box ?? raw.eaches_per_box) ?? null;
  // FIX: Duplicate field lookups were no-ops (raw.X ?? raw.X) - use alternative field names
  const boxes_per_case = num(raw.boxes_per_case ?? raw.bx_per_case ?? raw.boxes_per_cs) ?? null;
  const packs_per_case = num(raw.packs_per_case ?? raw.pk_per_case ?? raw.packs_per_cs) ?? null;
  const eaches_per_box = num(raw.eaches_per_box ?? raw.ea_per_box ?? raw.qty_per_box) ?? box_qty;
  const eaches_per_case = num(raw.eaches_per_case ?? raw.ea_per_case ?? raw.total_units) ?? case_qty ?? null;

  return {
    boxes_per_case: boxes_per_case ?? null,
    packs_per_case: packs_per_case ?? null,
    eaches_per_box: eaches_per_box ?? null,
    eaches_per_case: eaches_per_case ?? null,
    case_qty: case_qty ?? null,
  };
}

/**
 * Compute normalized case cost from supplier price and basis using packaging.
 */
export function normalizeToCaseCost(input: PricingNormalizationInput): PricingNormalizationResult {
  const { raw } = input;
  const flags: ReviewFlag[] = [];
  const notes: string[] = [];
  const packaging = parsePackaging(raw);

  const parsed = parsePriceBasis(raw);
  const supplier_cost = input.supplier_cost ?? num(raw.cost ?? raw.price ?? raw.unit_cost ?? raw.list_price ?? raw.supplier_cost) ?? 0;

  if (supplier_cost < 0 || !Number.isFinite(supplier_cost)) {
    flags.push({
      code: "invalid_supplier_price",
      message: "Supplier price is missing, negative, or invalid.",
      severity: "error",
    });
    return {
      supplier_price_amount: 0,
      supplier_price_basis: "case",
      sell_unit: SELL_UNIT,
      boxes_per_case: null,
      packs_per_case: null,
      eaches_per_box: null,
      eaches_per_case: null,
      computed_case_qty: null,
      normalized_case_cost: null,
      pricing_confidence: 0,
      pricing_notes: ["Invalid or missing supplier price."],
      flags,
    };
  }

  if (!parsed) {
    const amount = supplier_cost;
    notes.push("Price basis not found; assuming case.");
    flags.push({
      code: "ambiguous_price_basis",
      message: "Price basis could not be determined from feed; treating as case price.",
      severity: "warning",
    });
    return {
      supplier_price_amount: amount,
      supplier_price_basis: "case",
      sell_unit: SELL_UNIT,
      boxes_per_case: packaging.boxes_per_case,
      packs_per_case: packaging.packs_per_case,
      eaches_per_box: packaging.eaches_per_box,
      eaches_per_case: packaging.eaches_per_case,
      computed_case_qty: packaging.case_qty,
      normalized_case_cost: amount,
      pricing_confidence: 0.7,
      pricing_notes: notes,
      flags,
      conversion_formula: `$${amount.toFixed(2)}/case (basis assumed)`,
    };
  }

  const { basis, amount } = parsed;
  let normalized_case_cost: number | null = null;
  let computed_case_qty: number | null = packaging.case_qty;
  let confidence = 0.9;
  let formula = "";

  if (basis === "case") {
    normalized_case_cost = amount;
    formula = `$${amount.toFixed(2)}/case`;
  } else if (basis === "box") {
    const boxesPerCase = packaging.boxes_per_case ?? num(raw.boxes_per_case);
    if (boxesPerCase != null && boxesPerCase > 0) {
      normalized_case_cost = amount * boxesPerCase;
      computed_case_qty = (packaging.eaches_per_box ?? 0) * boxesPerCase || null;
      formula = `$${amount.toFixed(2)}/box × ${boxesPerCase} boxes/case = $${normalized_case_cost.toFixed(2)}/case`;
    } else {
      flags.push({
        code: "missing_case_conversion_data",
        message: "Box pricing but boxes_per_case (or boxes per case) unknown; cannot compute case cost.",
        severity: "error",
      });
      notes.push("Missing boxes_per_case for box→case conversion.");
      confidence = 0;
    }
  } else if (basis === "each" || basis === "pair") {
    const eachesPerCase = packaging.eaches_per_case ?? packaging.case_qty;
    if (eachesPerCase != null && eachesPerCase > 0) {
      const unitsPerCase = basis === "pair" ? eachesPerCase / 2 : eachesPerCase;
      normalized_case_cost = amount * unitsPerCase;
      computed_case_qty = eachesPerCase;
      const unitLabel = basis === "pair" ? "pair" : "each";
      formula = `$${amount.toFixed(2)}/${unitLabel} × ${unitsPerCase} ${unitLabel}s/case = $${normalized_case_cost.toFixed(2)}/case`;
    } else {
      flags.push({
        code: "missing_case_conversion_data",
        message: `${basis} pricing but eaches_per_case/case_qty unknown; cannot compute case cost.`,
        severity: "error",
      });
      notes.push(`Missing eaches_per_case or case_qty for ${basis}→case conversion.`);
      confidence = 0;
    }
  } else if (basis === "pack") {
    const packsPerCase = packaging.packs_per_case ?? num(raw.packs_per_case);
    if (packsPerCase != null && packsPerCase > 0) {
      normalized_case_cost = amount * packsPerCase;
      formula = `$${amount.toFixed(2)}/pack × ${packsPerCase} packs/case = $${normalized_case_cost.toFixed(2)}/case`;
    } else {
      flags.push({
        code: "missing_case_conversion_data",
        message: "Pack pricing but packs_per_case unknown; cannot compute case cost.",
        severity: "error",
      });
      notes.push("Missing packs_per_case for pack→case conversion.");
      confidence = 0;
    }
  } else if (basis === "carton") {
    const boxesPerCase = packaging.boxes_per_case ?? 1;
    normalized_case_cost = amount * boxesPerCase;
    formula = `$${amount.toFixed(2)}/carton × ${boxesPerCase} = $${normalized_case_cost.toFixed(2)}/case`;
  }

  if (normalized_case_cost != null && (normalized_case_cost < 0 || !Number.isFinite(normalized_case_cost))) {
    flags.push({ code: "invalid_supplier_price", message: "Computed case cost is invalid.", severity: "error" });
    normalized_case_cost = null;
    confidence = 0;
  }

  const inconsistent =
    packaging.eaches_per_case != null &&
    packaging.eaches_per_box != null &&
    packaging.boxes_per_case != null &&
    packaging.boxes_per_case > 0 &&
    Math.abs(packaging.eaches_per_box * packaging.boxes_per_case - packaging.eaches_per_case) > 0.01 * packaging.eaches_per_case;
  if (inconsistent) {
    flags.push({
      code: "inconsistent_case_quantity",
      message: "Packaging quantities are inconsistent (e.g. eaches_per_box × boxes_per_case ≠ eaches_per_case).",
      severity: "warning",
    });
    notes.push("Inconsistent case/box/each quantities.");
  }

  return {
    supplier_price_amount: amount,
    supplier_price_basis: basis,
    sell_unit: SELL_UNIT,
    boxes_per_case: packaging.boxes_per_case,
    packs_per_case: packaging.packs_per_case,
    eaches_per_box: packaging.eaches_per_box,
    eaches_per_case: packaging.eaches_per_case ?? null,
    computed_case_qty,
    normalized_case_cost,
    pricing_confidence: normalized_case_cost != null ? confidence : 0,
    pricing_notes: notes,
    flags,
    conversion_formula: formula || undefined,
  };
}
