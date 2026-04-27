import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

/**
 * Static guard: any supplier_offers insert/upsert/update in CatalogOS / storefront src
 * must go through buildSupplierOfferUpsertRow (or normalizeSupplierOfferPricing for updates).
 */
function collectTsFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git" || name === "dist" || name === ".next") continue;
    const p = path.join(dir, name);
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) collectTsFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx"))
      out.push(p);
  }
  return out;
}

const WRITE_RE = /from\(["']supplier_offers["']\)\s*\.\s*(upsert|insert|update)\b/;

describe("supplier_offers write path enforcement", () => {
  it("no direct supplier_offers write without normalization helper in same file", () => {
    const repoRoot = path.join(__dirname, "../../../../");
    const scanRoots = [path.join(repoRoot, "catalogos", "src"), path.join(repoRoot, "storefront", "src")];
    const files: string[] = [];
    for (const r of scanRoots) collectTsFiles(r, files);

    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf-8");
      if (!WRITE_RE.test(text)) continue;
      const hasUpsertOrInsert = /from\(["']supplier_offers["']\)\s*\.\s*(upsert|insert)\b/.test(text);
      const hasUpdate = /from\(["']supplier_offers["']\)\s*\.\s*update\b/.test(text);
      if (hasUpsertOrInsert && !text.includes("buildSupplierOfferUpsertRow")) {
        offenders.push(`${path.relative(repoRoot, f)}: upsert/insert without buildSupplierOfferUpsertRow`);
      }
      if (
        hasUpdate &&
        !text.includes("buildSupplierOfferUpsertRow") &&
        !text.includes("normalizeSupplierOfferPricing")
      ) {
        offenders.push(
          `${path.relative(repoRoot, f)}: update without buildSupplierOfferUpsertRow or normalizeSupplierOfferPricing`
        );
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
