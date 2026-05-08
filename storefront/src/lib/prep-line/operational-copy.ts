/**
 * Governed buyer-facing copy for restaurant prep-line (Phase 2C).
 * Centralize strings to prevent ecommerce / AI drift.
 */
export const PREP_LINE_COPY_VERSION = 1 as const;

export const PrepLineOperationalCopy = {
  wizardSubtext:
    "Catalog-filtered candidates with advisory notes only. Listing data and your food safety program remain authoritative for compliance decisions.",
  staticAdvisoryNotice:
    "Advisory only — candidates meet catalog evidence rules (food_safe certification and/or food_handling use). Verify attributes and certifications on each listing before purchasing.",
  wizardLoading: "Matching catalog to your inputs…",
  wizardSubmitCta: "See catalog shortlist",
  candidateLabel: (index: number) => `Candidate ${String.fromCharCode(65 + index)}`, // A, B, C
  advisoryPanelTitle: "Advisory note (non-authoritative)",
  advisoryPanelLead:
    "The following text is advisory and non-authoritative. Catalog attributes and the product page remain the source of truth.",
  operationalRationaleTitle: "Operational rationale (advisory)",
  catalogFactsTitle: "Catalog facts (this listing)",
  evidenceStrip:
    "Shortlist criterion: products match governed catalog rules — food_safe certification and/or food_handling use.",
  compareDialogTitle: "Prep-line spec comparison",
  compareSheetTrigger: "Compare catalog fields",
  compareNoRanking: "No ranking — compare catalog fields only. Open each product page for full specifications.",
  viewSpecificationsCta: "Open specifications & variants",
  addToQuoteRequestCta: "Add to quote request",
  checklistTitle: "Prep-line operational checklist",
  checklistDisclaimer:
    "This checklist does not change catalog results in this release. It highlights operational cautions for your review.",
  continuityRequestRef: (ref: string) =>
    `Your prep-line request reference: ${ref}. Cite it in email subject lines or when you call so we can continue the same thread.`,
  continuityBusinessDays: "We review requests on business days and respond using the contact details you provided.",
  trustCueSpecs: "Catalog-backed listing data",
  trustCueQuote: "Quote & program pricing paths",
  trustCueVerify: "Verify critical specs on the product page",
} as const;

/** Banned substrings in prep-line governed surfaces (CI). Extend in tests. */
export const PREP_LINE_BANNED_SUBSTRINGS = [
  "ai-powered",
  "smart recommendation",
  "best glove",
  "perfect",
  "ideal pick",
  "recommended for your kitchen",
] as const;

export function assertPrepLineCopyHasNoBannedLanguage(text: string): void {
  const lower = text.toLowerCase();
  for (const b of PREP_LINE_BANNED_SUBSTRINGS) {
    if (lower.includes(b)) {
      throw new Error(`Prep-line copy governance: banned phrase "${b}"`);
    }
  }
}
