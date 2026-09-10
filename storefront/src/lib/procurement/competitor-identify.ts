/**
 * Deterministic competitor identification from SKU / UPC / invoice description aliases.
 * No AI. Operator-confirmed aliases win forever until changed.
 */

export type CompetitorAliasType = "sku" | "upc" | "invoice_description" | "manufacturer_sku";

export function normalizeCompetitorAlias(type: CompetitorAliasType, raw: string): string {
  const s = String(raw ?? "").trim();
  if (type === "upc") return s.replace(/\D/g, "").slice(0, 14);
  if (type === "invoice_description") return s.toLowerCase().replace(/\s+/g, " ");
  return s.toUpperCase().replace(/\s+/g, "");
}

export type CompetitorAliasHit = {
  competitor_product_id: string;
  alias_type: CompetitorAliasType;
};

export type CompetitorAliasRepo = {
  findAlias: (type: CompetitorAliasType, normalized: string) => Promise<CompetitorAliasHit | null> | CompetitorAliasHit | null;
};

export async function identifyCompetitorProduct(input: {
  sku?: string | null;
  manufacturer_sku?: string | null;
  upc?: string | null;
  description?: string | null;
  repo: CompetitorAliasRepo;
}): Promise<{ competitor_product_id: string; identified_by: "sku" | "upc" | "alias" } | null> {
  const tries: Array<{ type: CompetitorAliasType; raw: string; by: "sku" | "upc" | "alias" }> = [];
  if (input.sku?.trim()) tries.push({ type: "sku", raw: input.sku, by: "sku" });
  if (input.manufacturer_sku?.trim()) tries.push({ type: "manufacturer_sku", raw: input.manufacturer_sku, by: "sku" });
  if (input.upc?.trim()) tries.push({ type: "upc", raw: input.upc, by: "upc" });
  if (input.description?.trim()) tries.push({ type: "invoice_description", raw: input.description, by: "alias" });

  for (const t of tries) {
    const n = normalizeCompetitorAlias(t.type, t.raw);
    if (!n) continue;
    const hit = await input.repo.findAlias(t.type, n);
    if (hit) return { competitor_product_id: hit.competitor_product_id, identified_by: t.by };
  }
  return null;
}

export function memoryAliasRepo(rows: Array<{ type: CompetitorAliasType; normalized: string; competitor_product_id: string }>): CompetitorAliasRepo {
  return {
    findAlias(type, normalized) {
      const hit = rows.find((r) => r.type === type && r.normalized === normalized);
      return hit ? { competitor_product_id: hit.competitor_product_id, alias_type: type } : null;
    },
  };
}
