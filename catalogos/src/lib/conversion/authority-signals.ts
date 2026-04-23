/**
 * Authority / trust signals: map product attributes to industry authority badges.
 * Examples: "Most used by restaurants", "Popular with janitorial crews".
 * Fail gracefully when attributes are missing.
 */

import type { LiveProductItem } from "@/lib/catalog/types";

export interface AuthorityBadge {
  key: string;
  label: string;
}

function numAttr(attrs: Record<string, unknown>, key: string): number | null {
  const v = attrs?.[key];
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strAttr(attrs: Record<string, unknown>, key: string): string | null {
  const v = attrs?.[key];
  if (v == null) return null;
  return String(v).trim().toLowerCase() || null;
}

/**
 * Rule: (material, thickness range, color, grade) → authority label.
 * First matching rule wins.
 */
function matchAuthorityRules(attrs: Record<string, unknown>): AuthorityBadge | null {
  const material = strAttr(attrs, "material");
  const thickness = numAttr(attrs, "thickness_mil");
  const color = strAttr(attrs, "color");
  const grade = strAttr(attrs, "grade");

  if (!material) return null;

  const inRange = (min: number, max: number) =>
    thickness != null && thickness >= min && thickness <= max;

  // black nitrile + 4–6 mil → restaurants
  if (material === "nitrile" && (color === "black" || color === "grey") && inRange(4, 6)) {
    return { key: "restaurants", label: "Most used by restaurants" };
  }
  // black nitrile + medical → tattoo
  if (material === "nitrile" && (color === "black" || color === "grey") && (grade === "medical_exam_grade" || grade === "medical")) {
    return { key: "tattoo", label: "Trusted by tattoo artists" };
  }
  // 6–8 mil nitrile → automotive
  if (material === "nitrile" && inRange(6, 8)) {
    return { key: "mechanics", label: "Top choice for mechanics" };
  }
  // nitrile or latex → janitorial (general)
  if ((material === "nitrile" || material === "latex") && inRange(2, 8)) {
    return { key: "janitorial", label: "Popular with janitorial crews" };
  }
  // food grade → restaurants
  if (grade === "food_service_grade" || grade === "food") {
    return { key: "restaurants", label: "Most used by restaurants" };
  }
  // medical grade
  if (grade === "medical_exam_grade" || grade === "medical") {
    return { key: "healthcare", label: "Trusted by healthcare" };
  }

  return null;
}

/**
 * Compute authority badge for a product. Returns at most one badge (first matching rule).
 */
export function computeAuthorityBadge(item: LiveProductItem): AuthorityBadge | null {
  const attrs = (item.attributes ?? {}) as Record<string, unknown>;
  return matchAuthorityRules(attrs);
}
