export type PublicFunnelCategory =
  | "catalogos_resolve"
  | "invoice_intake"
  | "lead_request_pricing"
  /** Next prep-line / ontology glove flow (POST /api/ai/glove-finder). */
  | "glove_finder_prep_line"
  /** Find-my-glove wizard (POST /api/gloves/recommend). */
  | "gloves_wizard_recommend";

/**
 * One-line JSON logs for Vercel/serverless. Never pass secrets, raw bodies, or PII dumps.
 */
export function logPublicFunnel(
  category: PublicFunnelCategory,
  event: string,
  fields: Record<string, unknown>
): void {
  try {
    console.log(JSON.stringify({ category, event, ts: new Date().toISOString(), ...fields }));
  } catch {
    console.log(JSON.stringify({ category, event, ts: new Date().toISOString(), log_error: "serialize_failed" }));
  }
}
