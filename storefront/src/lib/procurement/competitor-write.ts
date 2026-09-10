/**
 * Operator-confirmed competitor identity and equivalency writes.
 * Creating a row never auto-approves equivalency.
 */

import { normalizeCompetitorAlias, type CompetitorAliasType } from "@/lib/procurement/competitor-identify";

export async function upsertCompetitorAlias(
  supabase: any,
  input: {
    competitor_product_id: string;
    alias_type: CompetitorAliasType;
    raw_value: string;
    source?: "operator" | "system" | "invoice";
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = normalizeCompetitorAlias(input.alias_type, input.raw_value);
  if (!normalized) return { ok: false, error: "empty_alias" };
  const now = new Date().toISOString();
  const { error } = await supabase.schema("gc_commerce").from("competitor_product_aliases").upsert(
    {
      competitor_product_id: input.competitor_product_id,
      alias_type: input.alias_type,
      raw_value: String(input.raw_value).trim(),
      normalized_value: normalized,
      source: input.source ?? "operator",
      updated_at: now,
    },
    { onConflict: "alias_type,normalized_value" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
