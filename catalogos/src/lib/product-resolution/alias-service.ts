/**
 * Product alias memory: resolve alias_key to canonical value for attribute normalization.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

const ALIAS_DOMAIN = "attribute";

export async function resolveAlias(aliasKey: string, domain: string = ALIAS_DOMAIN): Promise<string | null> {
  if (!aliasKey?.trim()) return null;
  const key = aliasKey.trim().toLowerCase();
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("product_aliases")
    .select("canonical_value")
    .eq("alias_key", key)
    .eq("attribute_domain", domain)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { canonical_value: string }).canonical_value;
}

/** Resolve multiple keys; returns map alias_key -> canonical_value. */
export async function resolveAliases(
  keys: string[],
  domain: string = ALIAS_DOMAIN
): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  const supabase = getSupabaseCatalogos(true);
  const normalized = keys.map((k) => k.trim().toLowerCase()).filter(Boolean);
  const { data, error } = await supabase
    .from("product_aliases")
    .select("alias_key, canonical_value")
    .eq("attribute_domain", domain)
    .in("alias_key", normalized);
  if (error) return new Map();
  const map = new Map<string, string>();
  for (const r of data ?? []) {
    const row = r as { alias_key: string; canonical_value: string };
    map.set(row.alias_key, row.canonical_value);
  }
  return map;
}

export async function recordAliasUsage(aliasKey: string, canonicalValue: string, domain: string = ALIAS_DOMAIN): Promise<void> {
  const key = aliasKey.trim().toLowerCase();
  if (!key) return;
  const supabase = getSupabaseCatalogos(true);
  await supabase
    .from("product_aliases")
    .upsert(
      {
        alias_key: key,
        canonical_value: canonicalValue,
        attribute_domain: domain,
        usage_count: 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "alias_key,attribute_domain", ignoreDuplicates: false }
    );
}
