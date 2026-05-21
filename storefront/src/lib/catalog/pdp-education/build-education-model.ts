import type { BuildEducationInput, PdpEducationModel } from "@/lib/catalog/pdp-education/types";
import { normalizePdpAttributes, allAttrValues, attrHaystack } from "@/lib/catalog/pdp-education/normalize-attributes";
import { detectGloveFamily, deriveClassification } from "@/lib/catalog/pdp-education/detect-family";
import { derivePerformanceMetrics } from "@/lib/catalog/pdp-education/derive-performance";
import {
  deriveBestFor,
  deriveEducationalSummary,
  deriveWatchOut,
  deriveWhatThisMeans,
} from "@/lib/catalog/pdp-education/derive-copy";
import { deriveCertificationCards } from "@/lib/catalog/pdp-education/derive-certifications";
import { deriveEducationTabs, specHighlightsForFamily } from "@/lib/catalog/pdp-education/derive-tabs";

export function buildPdpEducationModel(input: BuildEducationInput): PdpEducationModel {
  const attrs = normalizePdpAttributes(input.specRows);
  const family = detectGloveFamily(attrs, input.metadata);
  const hay = attrHaystack(attrs);

  const uses = allAttrValues(attrs, "uses");
  const industries = allAttrValues(attrs, "industries");
  const protectionTags = allAttrValues(attrs, "protection_tags");

  const hasCutContext = Boolean(attrs.cut_level_ansi?.length);
  const hasChemicalContext =
    hay.includes("chem") ||
    hay.includes("solvent") ||
    protectionTags.some((t) => /chem|solvent/i.test(t));
  const hasFoodContext =
    hay.includes("food") ||
    (attrs.grade ?? []).some((g) => /food/i.test(g)) ||
    (attrs.certifications ?? []).some((c) => /food|fda/i.test(c));

  const base: Omit<PdpEducationModel, "tabs"> = {
    family,
    classification: deriveClassification(family, attrs),
    educationalSummary: deriveEducationalSummary(family, attrs, input.description),
    whatThisMeans: deriveWhatThisMeans(family, attrs),
    bestFor: deriveBestFor(attrs),
    watchOut: deriveWatchOut(family, attrs),
    performance: derivePerformanceMetrics(family, attrs),
    certifications: deriveCertificationCards(input.certificationRows, input.specRows),
    specHighlights: specHighlightsForFamily(family, input.specRows),
    uses,
    industries,
    protectionTags,
    hasFoodContext,
    hasChemicalContext,
    hasCutContext,
    primaryDownload: input.downloads[0] ?? null,
  };

  return {
    ...base,
    tabs: deriveEducationTabs(base),
  };
}
