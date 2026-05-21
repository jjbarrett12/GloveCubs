import type { EducationTab, EducationTabId, GloveFamily, PdpEducationModel } from "@/lib/catalog/pdp-education/types";

const TAB_LABELS: Record<EducationTabId, string> = {
  overview: "Overview",
  performance: "Performance impact",
  certifications: "Certifications",
  "material-science": "Material science",
  "cut-resistance": "Cut resistance",
  "chemical-resistance": "Chemical resistance",
  "dexterity-comfort": "Dexterity & comfort",
  grip: "Grip performance",
  "food-safety": "Food safety",
  "use-environments": "Use environments",
  standards: "Standards",
  storage: "Storage & shelf life",
};

export function deriveEducationTabs(model: Omit<PdpEducationModel, "tabs">): EducationTab[] {
  const tabs: EducationTabId[] = ["overview"];

  if (model.performance.length > 0) tabs.push("performance");

  if (model.certifications.length > 0) tabs.push("certifications");

  const specKeys = new Set(model.specHighlights.map((s) => s.attribute_key));
  if (
    specKeys.has("material") ||
    specKeys.has("thickness_mil") ||
    specKeys.has("texture") ||
    specKeys.has("coating") ||
    specKeys.has("cuff_style")
  ) {
    tabs.push("material-science");
  }

  if (model.hasCutContext) tabs.push("cut-resistance");
  if (model.hasChemicalContext) tabs.push("chemical-resistance");
  if (model.performance.some((p) => p.key === "dexterity" || p.key === "comfort")) tabs.push("dexterity-comfort");
  if (specKeys.has("texture") || specKeys.has("coating")) tabs.push("grip");
  if (model.hasFoodContext) tabs.push("food-safety");
  if (model.uses.length > 0 || model.industries.length > 0) tabs.push("use-environments");

  if (
    model.certifications.length > 0 ||
    specKeys.has("grade") ||
    specKeys.has("sterility") ||
    specKeys.has("abrasion_level") ||
    specKeys.has("puncture_level")
  ) {
    tabs.push("standards");
  }

  if (specKeys.has("sterility") || specKeys.has("packaging")) tabs.push("storage");

  const unique = Array.from(new Set(tabs));
  return unique.map((id) => ({ id, label: TAB_LABELS[id] }));
}

export function specHighlightsForFamily(
  family: GloveFamily,
  specRows: { label: string; value: string; attribute_key: string }[]
) {
  const priority =
    family === "reusable"
      ? ["material", "coating", "cut_level_ansi", "texture", "cuff_style", "thickness_mil", "size", "color", "packaging"]
      : ["material", "thickness_mil", "texture", "cuff_style", "powder", "grade", "size", "color", "packaging", "box_qty"];

  const byKey = new Map(specRows.map((r) => [r.attribute_key, r]));
  const out = [];
  for (const key of priority) {
    const row = byKey.get(key);
    if (row) out.push({ label: row.label, value: row.value, attribute_key: row.attribute_key });
  }
  return out.slice(0, 12);
}
