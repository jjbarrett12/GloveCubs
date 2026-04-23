/**
 * Feature flags and thresholds for AI fallback.
 * Rules first, AI second; AI only when confidence is below threshold.
 */

function envBool(key: string, defaultValue: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === "") return defaultValue;
  return v.toLowerCase() === "true" || v === "1";
}

function envNum(key: string, defaultValue: number, min: number, max: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return defaultValue;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaultValue;
}

/** Enable AI extraction fallback when rules extraction confidence is low. */
export const AI_EXTRACTION_ENABLED = envBool("CATALOGOS_AI_EXTRACTION_ENABLED", false);

/** Enable AI matching fallback when rules match confidence is low. */
export const AI_MATCHING_ENABLED = envBool("CATALOGOS_AI_MATCHING_ENABLED", false);

/**
 * When true, runMatchingWithAIFallback may call the AI matcher inline (legacy).
 * Default false: pass-2 only via batch-ai-matching / deferred worker (large imports stay fast).
 */
export const AI_MATCHING_INLINE_ENABLED = envBool("CATALOGOS_AI_MATCHING_INLINE_ENABLED", false);

/** Below this extraction confidence (0–1), consider calling AI extraction. */
export const EXTRACTION_AI_THRESHOLD = envNum("CATALOGOS_EXTRACTION_AI_THRESHOLD", 0.6, 0, 1);

/** Below this match confidence (0–1), consider calling AI matching. */
export const MATCH_AI_THRESHOLD = envNum("CATALOGOS_MATCH_AI_THRESHOLD", 0.6, 0, 1);

/** Anomaly code added when AI was used, so it's never silently published. */
export const AI_SUGGESTED_NEEDS_REVIEW_CODE = "AI_SUGGESTED_NEEDS_REVIEW" as const;
