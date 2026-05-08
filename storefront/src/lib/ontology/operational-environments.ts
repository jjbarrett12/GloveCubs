/**
 * Canonical operational environment keys (ontology).
 * Phase 2B: restaurant prep-line pilot only — extend with migrations + governance later.
 */

export const RESTAURANT_PREP_LINE_ENVIRONMENT_KEY = "restaurant_prep_line" as const;

export type OperationalEnvironmentKey = typeof RESTAURANT_PREP_LINE_ENVIRONMENT_KEY;

/** Human-readable semantics for ops/docs — not shown as catalog truth. */
export const RESTAURANT_PREP_LINE_SEMANTICS = {
  key: RESTAURANT_PREP_LINE_ENVIRONMENT_KEY,
  /** Governed evidence: product must match at least one of these attribute assertions (see prep-line-candidates). */
  evidence: {
    certifications_any_of: ["food_safe"] as const,
    uses_any_of: ["food_handling"] as const,
    evidence_mode: "union_of_attribute_hits" as const,
  },
  /** Operational notes for prompts and training — advisory, not PDP claims. */
  operational_notes: [
    "Intermittent wet grip and frequent glove changes are common on prep lines.",
    "Dexterity-sensitive tasks (knife work) favor consistent sizing and tactile feedback; verify variant fit on PDP.",
    "Extended wear may occur; comfort tradeoffs are contextual — do not assert comfort without supplier data.",
  ],
} as const;

export function isRestaurantPrepLineEnvironment(
  key: string | null | undefined
): key is OperationalEnvironmentKey {
  return key === RESTAURANT_PREP_LINE_ENVIRONMENT_KEY;
}
