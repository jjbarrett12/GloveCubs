import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  describeLifecycleStageForOperator,
  describeOrderStatusForOperator,
  describeQuoteStatusForOperator,
} from "@/lib/procurement/operator-lifecycle-copy";
import { buyerLifecycleStageLabel } from "@/lib/procurement/buyer-lifecycle-copy";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("admin operator coherence (Slice 1D)", () => {
  it("operator lifecycle copy includes buyer mirror labels", () => {
    const o = describeLifecycleStageForOperator("quote_linked");
    expect(o.buyerSees).toBe(buyerLifecycleStageLabel("quote_linked"));
    expect(o.label).toMatch(/quote request linked/i);
    expect(o.domain).toBe("quote_review");
  });

  it("quote status operator copy mirrors buyer-safe labels", () => {
    const q = describeQuoteStatusForOperator("reviewing");
    expect(q.buyerSees).toBe("Under review");
    expect(q.internalLabel).toMatch(/quote review/i);
    expect(q.domain).toBe("quote_review");
  });

  it("order status copy uses fulfillment domain language", () => {
    const o = describeOrderStatusForOperator("processing");
    expect(o.domain).toBe("fulfillment");
    expect(o.label.toLowerCase()).toMatch(/fulfillment/);
  });

  it("buyer lifecycle copy does not import operator copy", () => {
    const s = read("lib/procurement/buyer-lifecycle-copy.ts");
    expect(s).not.toMatch(/from\s+["']@\/lib\/procurement\/operator-lifecycle-copy["']/);
  });

  it("admin nav groups procurement before fulfillment and catalog", () => {
    const shell = read("app/admin/_components/AdminShell.tsx");
    expect(shell).toContain('title="Procurement"');
    expect(shell).toContain('title="Fulfillment"');
    expect(shell).toContain("Sourcing threads");
    expect(shell).toContain("Quote requests");
    expect(shell).not.toMatch(/title="Sales & catalog"/);
  });

  it("admin dashboard prioritizes procurement queues", () => {
    const page = read("app/admin/page.tsx");
    const procIdx = page.indexOf("Procurement queues");
    const catalogIdx = page.indexOf("Catalog quality");
    expect(procIdx).toBeGreaterThan(-1);
    expect(catalogIdx).toBeGreaterThan(procIdx);
    expect(page).toContain("describeQuoteStatusForOperator");
  });

  it("sourcing threads page uses operator vocabulary with buyer mirror", () => {
    const page = read("app/admin/opportunities/page.tsx");
    expect(page).toContain("Sourcing threads");
    expect(page).toContain("describeLifecycleStageForOperator");
    expect(page).toContain("buyerSees");
  });

  it("admin procurement surfaces avoid one-click reorder language", () => {
    const paths = [
      "app/admin/page.tsx",
      "app/admin/leads/page.tsx",
      "app/admin/opportunities/page.tsx",
      "app/admin/procurement/page.tsx",
    ];
    for (const p of paths) {
      const s = read(p).toLowerCase();
      expect(s, p).not.toMatch(/one click|one-click reorder/);
    }
  });
});
