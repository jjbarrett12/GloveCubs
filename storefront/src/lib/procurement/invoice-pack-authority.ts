/**
 * Canonical pack / UoM authority for invoice savings.
 * Never silently infers missing pack counts.
 */

export type InvoiceQuantityUom = "EA" | "BX" | "CS";

export type InvoicePackFacts = {
  quantity_uom: InvoiceQuantityUom | null;
  gloves_per_box: number | null;
  boxes_per_case: number | null;
  gloves_per_case: number | null;
};

export type PackAuthorityOk = {
  ok: true;
  quantity_uom: InvoiceQuantityUom;
  gloves_per_purchased_unit: number;
  gloves_per_box: number | null;
  boxes_per_case: number | null;
  gloves_per_case: number | null;
};

export type PackAuthorityErr = {
  ok: false;
  code: "UOM_REVIEW_REQUIRED";
  reason: string;
};

export type PackAuthorityResult = PackAuthorityOk | PackAuthorityErr;

function pos(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Gloves represented by quantity = 1 of the purchased UoM.
 * EA → 1 glove. BX requires gloves_per_box. CS requires gloves_per_case or box×case.
 */
export function resolveGlovesPerPurchasedUnit(pack: InvoicePackFacts): PackAuthorityResult {
  const uom = pack.quantity_uom;
  if (uom !== "EA" && uom !== "BX" && uom !== "CS") {
    return { ok: false, code: "UOM_REVIEW_REQUIRED", reason: "unknown_quantity_uom" };
  }

  const perBox = pos(pack.gloves_per_box);
  const boxes = pos(pack.boxes_per_case);
  const perCase = pos(pack.gloves_per_case);
  const derivedCase = perBox != null && boxes != null ? perBox * boxes : null;
  const glovesPerCase = perCase ?? derivedCase;

  if (uom === "EA") {
    return {
      ok: true,
      quantity_uom: "EA",
      gloves_per_purchased_unit: 1,
      gloves_per_box: perBox,
      boxes_per_case: boxes,
      gloves_per_case: glovesPerCase,
    };
  }

  if (uom === "BX") {
    if (perBox == null) {
      return { ok: false, code: "UOM_REVIEW_REQUIRED", reason: "missing_gloves_per_box" };
    }
    return {
      ok: true,
      quantity_uom: "BX",
      gloves_per_purchased_unit: perBox,
      gloves_per_box: perBox,
      boxes_per_case: boxes,
      gloves_per_case: glovesPerCase,
    };
  }

  if (glovesPerCase == null) {
    return { ok: false, code: "UOM_REVIEW_REQUIRED", reason: "missing_gloves_per_case" };
  }
  return {
    ok: true,
    quantity_uom: "CS",
    gloves_per_purchased_unit: glovesPerCase,
    gloves_per_box: perBox,
    boxes_per_case: boxes,
    gloves_per_case: glovesPerCase,
  };
}
