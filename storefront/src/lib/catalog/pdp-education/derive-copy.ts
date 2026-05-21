import type { GloveFamily } from "@/lib/catalog/pdp-education/types";
import { deriveClassification } from "@/lib/catalog/pdp-education/detect-family";
import {
  allAttrValues,
  firstAttr,
  joinAttr,
  type NormalizedPdpAttributes,
} from "@/lib/catalog/pdp-education/normalize-attributes";

export function deriveEducationalSummary(
  family: GloveFamily,
  attrs: NormalizedPdpAttributes,
  description: string | null
): string {
  if (description?.trim()) return description.trim().slice(0, 320);

  const material = firstAttr(attrs, "material");
  const thickness = firstAttr(attrs, "thickness_mil");
  const coating = firstAttr(attrs, "coating");
  const cut = firstAttr(attrs, "cut_level_ansi");
  const uses = joinAttr(attrs, "uses");

  if (family === "disposable") {
    const parts = [
      material ? `${material} disposable` : "Disposable glove",
      thickness ? `${thickness} mil barrier` : null,
      uses ? `oriented for ${uses.toLowerCase()}` : null,
    ].filter(Boolean);
    return `${parts.join(" — ")}. Directional procurement guidance from published attributes—not a safety certification.`;
  }

  if (family === "reusable") {
    const parts = [
      cut ? `ANSI cut level ${cut}` : null,
      coating ? `${coating} coating` : null,
      material ? `${material} shell` : null,
      uses ? `for ${uses.toLowerCase()}` : null,
    ].filter(Boolean);
    return `${parts.join(" · ")}. Evaluate against task hazards and published SKU specs before standardizing.`;
  }

  if (family === "chemical") {
    return [
      material ? `${material} chemical-barrier orientation` : "Chemical-barrier glove",
      "Confirm solvent compatibility on SDS and published SKU documentation before deployment.",
    ].join(" — ");
  }

  return deriveClassification(family, attrs);
}

export function deriveWhatThisMeans(family: GloveFamily, attrs: NormalizedPdpAttributes): string {
  const material = firstAttr(attrs, "material");
  const thickness = firstAttr(attrs, "thickness_mil");
  const texture = firstAttr(attrs, "texture");
  const coating = firstAttr(attrs, "coating");
  const cut = firstAttr(attrs, "cut_level_ansi");
  const cuff = firstAttr(attrs, "cuff_style");
  const powder = firstAttr(attrs, "powder");

  const sentences: string[] = [];

  if (family === "disposable" || family === "general") {
    if (material?.toLowerCase().includes("nitrile")) {
      sentences.push("Nitrile polymers generally orient toward better chemical and puncture resistance than vinyl in disposable programs.");
    } else if (material?.toLowerCase().includes("vinyl")) {
      sentences.push("Vinyl disposables often suit lower-risk, high-turnover tasks where cost per change matters more than heavy barrier.");
    } else if (material?.toLowerCase().includes("latex")) {
      sentences.push("Latex can offer strong dexterity; confirm allergy policies and published powder status before rollout.");
    }
    if (thickness) sentences.push(`Published thickness (${thickness} mil) influences barrier time versus tactile feel—thicker is not automatically better for every task.`);
    if (texture) sentences.push(`Texture (${texture}) affects wet/oil grip; match to handling environment.`);
    if (cuff) sentences.push(`Cuff style (${cuff}) changes splash and wrist coverage for cleaning or wet work.`);
    if (powder) sentences.push(`Powder status (${powder}) matters for food, clinical, and contamination-sensitive environments.`);
  }

  if (family === "reusable") {
    if (cut) sentences.push(`ANSI cut level ${cut} signals intended sharp-material environments—verify on the SKU label, not marketing copy alone.`);
    if (coating && material) sentences.push(`${material} shell with ${coating} coating balances cut/abrasion needs with grip in the published coating class.`);
    else if (coating) sentences.push(`${coating} coating changes oil/wet grip and wear rate versus uncoated shells.`);
    else if (material) sentences.push(`${material} shell material drives baseline abrasion and comfort tradeoffs.`);
  }

  if (family === "chemical") {
    sentences.push("Chemical gloves require published compatibility review per solvent class—this page does not state breakthrough times unless listed on the SKU.");
    if (material) sentences.push(`Listed material (${material}) is the starting point for SDS cross-check.`);
  }

  if (sentences.length === 0) {
    return "Structured attributes on this SKU support procurement review. Confirm final selection against SDS, internal policies, and published specifications.";
  }

  return sentences.join(" ");
}

export function deriveBestFor(attrs: NormalizedPdpAttributes): string[] {
  const out: string[] = [];
  for (const u of allAttrValues(attrs, "uses")) out.push(u);
  for (const i of allAttrValues(attrs, "industries")) {
    if (!out.some((x) => x.toLowerCase() === i.toLowerCase())) out.push(i);
  }
  const grade = firstAttr(attrs, "grade");
  if (grade && !out.length) out.push(grade);
  const tags = allAttrValues(attrs, "protection_tags");
  for (const t of tags.slice(0, 2)) out.push(t);
  return out.slice(0, 6);
}

export function deriveWatchOut(family: GloveFamily, attrs: NormalizedPdpAttributes): string[] {
  const out: string[] = [];
  const hay = Object.values(attrs).flat().join(" ").toLowerCase();
  const thickness = firstAttr(attrs, "thickness_mil");
  const material = (firstAttr(attrs, "material") ?? "").toLowerCase();

  if (material.includes("latex")) out.push("Latex allergy and powder policies in food/clinical sites");
  if (thickness && parseFloat(thickness) >= 8) out.push("Heavy mil reduces dexterity for fine motor tasks");
  if (thickness && parseFloat(thickness) <= 4) out.push("Light mil may fail quickly under abrasion or snags");
  if (hay.includes("food") && material.includes("vinyl")) out.push("Confirm food-contact approvals on the exact SKU");
  if (family === "chemical" || hay.includes("chem") || hay.includes("solvent")) {
    out.push("Do not assume universal solvent protection—validate SDS compatibility");
  }
  if (firstAttr(attrs, "cut_level_ansi")) {
    const cut = firstAttr(attrs, "cut_level_ansi")!;
    out.push(`Cut level ${cut} does not cover impact, heat, or chemical hazards by itself`);
  }
  if (hay.includes("heat") || firstAttr(attrs, "flame_resistant")) out.push("Heat and flame tasks need task-specific standards beyond this listing");
  if (!out.length) out.push("Confirm task hazards (sharp, heat, oil, biological) against published SKU limits");

  return out.slice(0, 5);
}
