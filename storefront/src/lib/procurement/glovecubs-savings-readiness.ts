/**
 * Query-time classification of whether a GloveCubs catalog product/variant
 * can participate in governed invoice savings. Does not invent missing values.
 */

export type SavingsReadinessBlocker =
  | "inactive_product"
  | "inactive_or_missing_variant"
  | "missing_material"
  | "missing_grade"
  | "missing_thickness"
  | "missing_powder"
  | "missing_packaging"
  | "missing_sell_price";

export type GloveCubsSavingsReadinessRow = {
  catalog_product_id: string;
  catalog_variant_id: string | null;
  name: string;
  slug: string | null;
  size: string | null;
  specs_ready: boolean;
  packaging_ready: boolean;
  sell_price_ready: boolean;
  savings_eligible: boolean;
  blockers: SavingsReadinessBlocker[];
  color_present: boolean;
  texture_present: boolean;
  cuff_present: boolean;
  certifications_present: boolean;
  boxes_per_case_present: boolean;
  gloves_per_case_present: boolean;
};

export type ProductReadinessFacts = {
  catalog_product_id: string;
  name: string;
  slug: string | null;
  status: string;
  size: string | null;
  catalog_variant_id: string | null;
  variant_is_active: boolean;
  material: string | null;
  grade: string | null;
  thickness_mil: number | null;
  powder: string | null;
  gloves_per_box: number | null;
  list_unit_price_major: number | null;
  color?: string | null;
  texture?: string | null;
  cuff?: string | null;
  certifications?: string | null;
  boxes_per_case?: number | null;
  gloves_per_case?: number | null;
};

function present(s: string | null | undefined): boolean {
  return s != null && String(s).trim().length > 0;
}

function positive(n: number | null | undefined): boolean {
  return n != null && Number.isFinite(n) && n > 0;
}

export function classifyGloveCubsSavingsReadiness(facts: ProductReadinessFacts): GloveCubsSavingsReadinessRow {
  const blockers: SavingsReadinessBlocker[] = [];
  if (facts.status !== "active") blockers.push("inactive_product");
  if (!facts.catalog_variant_id || !facts.variant_is_active) blockers.push("inactive_or_missing_variant");
  if (!present(facts.material)) blockers.push("missing_material");
  if (!present(facts.grade)) blockers.push("missing_grade");
  if (!positive(facts.thickness_mil)) blockers.push("missing_thickness");
  if (!present(facts.powder)) blockers.push("missing_powder");
  const packaging_ready = positive(facts.gloves_per_box);
  if (!packaging_ready) blockers.push("missing_packaging");
  const sell_price_ready = positive(facts.list_unit_price_major);
  if (!sell_price_ready) blockers.push("missing_sell_price");
  const specs_ready =
    present(facts.material) && present(facts.grade) && positive(facts.thickness_mil) && present(facts.powder);
  return {
    catalog_product_id: facts.catalog_product_id,
    catalog_variant_id: facts.catalog_variant_id,
    name: facts.name,
    slug: facts.slug,
    size: facts.size,
    specs_ready,
    packaging_ready,
    sell_price_ready,
    savings_eligible: blockers.length === 0,
    blockers,
    color_present: present(facts.color),
    texture_present: present(facts.texture),
    cuff_present: present(facts.cuff),
    certifications_present: present(facts.certifications),
    boxes_per_case_present: positive(facts.boxes_per_case),
    gloves_per_case_present: positive(facts.gloves_per_case),
  };
}
