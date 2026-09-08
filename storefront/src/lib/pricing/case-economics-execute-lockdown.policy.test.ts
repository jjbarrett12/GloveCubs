import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const REVOKE = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261227120700_revoke_customer_case_economics_execute.sql",
);
const ORIGINAL = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261218120100_variant_pricing_authority_phase2b0.sql",
);
const PDP = path.resolve(__dirname, "../catalog/store-product-detail.ts");
const CONTRACTS = path.resolve(__dirname, "./variant-pricing-contracts.ts");

describe("case economics customer EXECUTE lockdown", () => {
  const revokeSql = readFileSync(REVOKE, "utf8");
  const originalSql = readFileSync(ORIGINAL, "utf8");

  it("original migration granted authenticated EXECUTE (the vulnerability)", () => {
    expect(originalSql).toMatch(
      /GRANT EXECUTE ON FUNCTION gc_commerce\.variant_case_economics_batch\(UUID\[\]\) TO authenticated/,
    );
    expect(originalSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.gc_variant_case_economics_batch\(UUID\[\]\) TO authenticated/,
    );
    expect(originalSql).toContain("SECURITY DEFINER");
    expect(originalSql).toContain("COALESCE(so.sell_price, so.cost)");
  });

  it("launch migration revokes authenticated/anon EXECUTE and keeps service_role", () => {
    expect(revokeSql).toContain(
      "REVOKE ALL ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) FROM authenticated",
    );
    expect(revokeSql).toContain(
      "REVOKE ALL ON FUNCTION public.gc_variant_case_economics_batch(UUID[]) FROM authenticated",
    );
    expect(revokeSql).toContain(
      "REVOKE ALL ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) FROM anon",
    );
    expect(revokeSql).toContain(
      "GRANT EXECUTE ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) TO service_role",
    );
    expect(revokeSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.gc_variant_case_economics_batch(UUID[]) TO service_role",
    );
    expect(revokeSql).not.toMatch(/GRANT EXECUTE[^\n]*variant_case_economics_batch[^\n]*TO authenticated/);
  });

  it("PDP economics caller uses service-role admin client only", () => {
    const pdp = readFileSync(PDP, "utf8");
    const contracts = readFileSync(CONTRACTS, "utf8");
    expect(pdp).toContain("getSupabaseAdmin");
    expect(pdp).toContain("fetchVariantCaseEconomicsBatch");
    expect(pdp).not.toContain("createSupabaseBrowserClient");
    expect(contracts).toContain('rpc("gc_variant_case_economics_batch"');
  });
});
