import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROUTE = path.resolve(__dirname, "route.ts");
const RLS = path.resolve(
  __dirname,
  "../../../../../../../supabase/migrations/20261227123000_phase3_competitor_crosswalk_rls.sql",
);

describe("competitor products API policy", () => {
  it("sanitizes GET ilike query and never interpolates raw q", () => {
    const src = readFileSync(ROUTE, "utf8");
    expect(src).toContain("sanitizeIlikeQuery");
    expect(src).not.toMatch(/ilike\.%\$\{q\}%/);
  });

  it("POST never writes equivalency approved", () => {
    const src = readFileSync(ROUTE, "utf8");
    expect(src).not.toMatch(/status:\s*"approved"/);
  });
});

describe("phase 3 competitor RLS migration", () => {
  it("enables RLS and revokes anon/authenticated", () => {
    const sql = readFileSync(RLS, "utf8");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON gc_commerce.competitor_products FROM anon, authenticated");
    expect(sql).not.toMatch(/DROP TABLE/i);
  });
});
