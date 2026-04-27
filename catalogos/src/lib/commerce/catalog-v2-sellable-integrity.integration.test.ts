import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const RUN = process.env.RUN_CATALOG_SELLABLE_GUARD === "1";

const commerceDir = dirname(fileURLToPath(import.meta.url));

/** Vitest cwd is often `catalogos/`; merge repo-root `.env` without adding a dotenv dependency. */
function mergeRepoRootDotenv() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && (process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim())) {
    return;
  }
  const envPath = join(commerceDir, "../../../../.env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined || process.env[k] === "") process.env[k] = v;
  }
}

const requireGuard = createRequire(import.meta.url);
const guardPath = join(commerceDir, "../../../../lib/catalog-v2-sellable-integrity-guard.js");
const {
  findCatalogV2SellableIntegrityViolations,
  formatCatalogV2SellableIntegrityReport,
} = requireGuard(guardPath) as {
  findCatalogV2SellableIntegrityViolations: (supabase: ReturnType<typeof createClient>) => Promise<
    Array<{ catalog_product_id: string; slug: string | null; internal_sku: string | null; reason: string }>
  >;
  formatCatalogV2SellableIntegrityReport: (v: unknown[]) => string;
};

describe.runIf(RUN)("catalog_v2 ↔ sellable_products (live DB)", () => {
  it("no active catalog_v2 product without active sellable row and list_price_minor ≥ 1", async () => {
    mergeRepoRootDotenv();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!key?.trim() || !url?.trim()) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) are required when RUN_CATALOG_SELLABLE_GUARD=1"
      );
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const violations = await findCatalogV2SellableIntegrityViolations(supabase);
    if (violations.length > 0) {
      throw new Error(formatCatalogV2SellableIntegrityReport(violations));
    }
    expect(violations).toEqual([]);
  });
});
