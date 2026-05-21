import type { GloveFamily } from "@/lib/catalog/pdp-education/types";
import { attrHaystack, firstAttr, type NormalizedPdpAttributes } from "@/lib/catalog/pdp-education/normalize-attributes";

const DISPOSABLE_CATEGORY_HINTS = ["disposable", "exam", "nitrile", "vinyl", "latex"];
const REUSABLE_CATEGORY_HINTS = ["work", "reusable", "cut", "supported", "mechanical"];
const CHEMICAL_HINTS = ["chemical", "solvent", "hazmat", "chem"];

function metadataCategorySlug(metadata: Record<string, unknown> | null): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = metadata.category_slug ?? metadata.categorySlug ?? metadata.product_type;
  return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : null;
}

export function detectGloveFamily(
  attrs: NormalizedPdpAttributes,
  metadata: Record<string, unknown> | null
): GloveFamily {
  const hay = attrHaystack(attrs);
  const category = metadataCategorySlug(metadata) ?? firstAttr(attrs, "category")?.toLowerCase() ?? "";

  if (firstAttr(attrs, "cut_level_ansi") || firstAttr(attrs, "coating") || firstAttr(attrs, "puncture_level")) {
    return "reusable";
  }

  if (REUSABLE_CATEGORY_HINTS.some((h) => category.includes(h) || hay.includes(h))) {
    if (!firstAttr(attrs, "thickness_mil")) return "reusable";
  }

  const chemSignals =
    hay.includes("chemical") ||
    hay.includes("solvent") ||
    (attrs.protection_tags ?? []).some((t) => CHEMICAL_HINTS.some((h) => t.toLowerCase().includes(h))) ||
    CHEMICAL_HINTS.some((h) => category.includes(h));

  if (chemSignals && !firstAttr(attrs, "thickness_mil")) return "chemical";

  if (firstAttr(attrs, "thickness_mil") || DISPOSABLE_CATEGORY_HINTS.some((h) => category.includes(h))) {
    return "disposable";
  }

  if (chemSignals) return "chemical";

  return "general";
}

export function deriveClassification(family: GloveFamily, attrs: NormalizedPdpAttributes): string {
  const material = firstAttr(attrs, "material");
  const grade = firstAttr(attrs, "grade");
  const cut = firstAttr(attrs, "cut_level_ansi");

  switch (family) {
    case "disposable": {
      const parts = ["Disposable glove"];
      if (material) parts.push(material);
      if (grade) parts.push(grade);
      return parts.join(" · ");
    }
    case "reusable": {
      const parts = ["Reusable / work glove"];
      if (cut) parts.push(`ANSI ${cut}`);
      if (material) parts.push(material);
      return parts.join(" · ");
    }
    case "chemical":
      return ["Chemical barrier glove", material, grade].filter(Boolean).join(" · ");
    default:
      return [material ? `${material} glove` : "Industrial glove", grade].filter(Boolean).join(" · ");
  }
}
