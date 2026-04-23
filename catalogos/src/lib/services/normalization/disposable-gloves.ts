import type { DisposableGloveAttributes } from "@/types/catalogos";

/** Rules-based extraction from raw row (CSV/API shape) into normalized attributes. */
export function normalizeDisposableGlove(raw: Record<string, unknown>): {
  normalized: Record<string, unknown>;
  attributes: DisposableGloveAttributes;
} {
  const normalized: Record<string, unknown> = {};
  const attrs: DisposableGloveAttributes = {};

  const str = (v: unknown): string =>
    v != null ? String(v).trim() : "";
  const num = (v: unknown): number | undefined => {
    if (v == null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const bool = (v: unknown): boolean | undefined => {
    if (v == null) return undefined;
    const s = String(v).toLowerCase();
    if (["1", "true", "yes", "y", "x"].includes(s)) return true;
    if (["0", "false", "no", "n", ""].includes(s)) return false;
    return undefined;
  };

  // Common raw keys (supplier-agnostic)
  const name = str(raw.name ?? raw.title ?? raw.product_name ?? raw.description);
  const sku = str(raw.sku ?? raw.item ?? raw.item_number ?? raw.product_id ?? raw.id);
  const brand = str(raw.brand ?? raw.manufacturer ?? raw.vendor);
  const desc = str(raw.description ?? raw.desc ?? raw.long_description);
  const upc = str(raw.upc ?? raw.gtin ?? raw.ean ?? raw.barcode);

  normalized.name = name || undefined;
  normalized.sku = sku || undefined;
  normalized.brand = brand || undefined;
  normalized.description = desc || undefined;
  normalized.upc = upc || undefined;

  attrs.brand = brand || undefined;

  const material = str(raw.material ?? raw.type ?? raw.glove_type);
  if (material) {
    const m = material.toLowerCase();
    if (m.includes("nitrile")) attrs.material = "nitrile";
    else if (m.includes("latex")) attrs.material = "latex";
    else if (m.includes("vinyl") || m.includes("pvc")) attrs.material = "vinyl";
    else if (m.includes("polyethylene") || m.includes("pe ")) attrs.material = "polyethylene";
    else attrs.material = material;
  }

  const color = str(raw.color ?? raw.colour);
  if (color) attrs.color = color.toLowerCase().replace(/\s+/g, "_");

  const size = str(raw.size ?? raw.sizes);
  if (size) attrs.size = size.toUpperCase().replace(/\s+/g, "_");

  const thickness = num(raw.thickness ?? raw.thickness_mil ?? raw.mil);
  if (thickness != null) attrs.thickness_mil = thickness;

  const pf = bool(raw.powder_free ?? raw["powder-free"] ?? raw.powderfree);
  if (pf != null) attrs.powder_free = pf;

  const lf = bool(raw.latex_free ?? raw["latex-free"] ?? raw.latexfree);
  if (lf != null) attrs.latex_free = lf;

  const cq = num(raw.case_qty ?? raw.case_qty ?? raw.caseqty ?? raw.qty_per_case);
  if (cq != null) attrs.case_qty = Math.floor(cq);

  const med = bool(raw.medical_grade ?? raw.medical ?? raw.exam ?? raw.exam_grade);
  if (med != null) attrs.medical_grade = med;

  const food = bool(raw.food_safe ?? raw.fda ?? raw.food_grade);
  if (food != null) attrs.food_safe = food;

  const grip = str(raw.grip ?? raw.texture ?? raw.grip_texture);
  if (grip) {
    const g = grip.toLowerCase();
    if (g.includes("textured") || g.includes("grip")) attrs.grip_texture = "textured";
    else if (g.includes("smooth")) attrs.grip_texture = "smooth";
    else attrs.grip_texture = grip;
  }

  return { normalized, attributes: attrs };
}
