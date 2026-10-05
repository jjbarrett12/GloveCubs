import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commitPublishPlansWith, type PublishWritePlan } from "./publish-atomic";
import type { PrivateQuery } from "@/lib/db/private-sql";

const migration = readFileSync(
  path.resolve(__dirname, "../../../../supabase/migrations/20261227122600_publish_staged_row_atomic.sql"),
  "utf8"
);

function plan(extra: PublishWritePlan = {}): PublishWritePlan {
  return {
    product_id: "72cd153d-e6d2-4861-9e81-9fff0d033fea",
    normalized_id: "a7181f03-7351-4f54-ae7d-a629ff4a801f",
    supplier_id: "8e914b0c-aec2-43f1-9a05-6ccbb5cda7bc",
    supplier_sku: "GL-N125F-M",
    cost: 57.8,
    ...extra,
  };
}

describe("atomic publish", () => {
  it("keeps sell price out of the database function", () => {
    expect(migration).not.toMatch(/sell_price\s*=/);
    expect(migration).toContain("gc_commerce.sellable_products");
    expect(migration).toContain("PERFORM catalogos.publish_assert_stage(v_fail, 'sellable')");
    const offerAt = migration.indexOf("INSERT INTO catalogos.supplier_offers");
    const sellableAt = migration.indexOf("PERFORM catalogos.publish_assert_stage(v_fail, 'sellable')");
    const activeAt = migration.indexOf("SET status = 'active'");
    expect(offerAt).toBeGreaterThan(0);
    expect(sellableAt).toBeGreaterThan(offerAt);
    expect(activeAt).toBeGreaterThan(sellableAt);
  });

  it("rolls back when commerce fails after catalog writes", async () => {
    const calls: string[] = [];
    const query: PrivateQuery = async (text) => {
      calls.push(text);
      if (text.includes("publish_staged_rows_atomic")) {
        throw new Error("publish_fault:sellable");
      }
      return { rows: [], rowCount: 0 };
    };
    await expect(commitPublishPlansWith(query, [plan({ fail_at: "sellable" })], true)).rejects.toThrow(/publish_fault:sellable/);
    expect(calls.some((call) => call === "BEGIN")).toBe(true);
    expect(calls.some((call) => call.includes("publish_staged_rows_atomic"))).toBe(true);
    expect(calls.some((call) => call === "ROLLBACK")).toBe(true);
    expect(calls.some((call) => call === "COMMIT")).toBe(false);
  });

  it("sends every family size in one database call", async () => {
    let payload = "";
    const query: PrivateQuery = async (text, params = []) => {
      if (text.includes("publish_staged_rows_atomic")) {
        payload = String(params[0]);
        return { rows: [{ result: { product_ids: ["parent"] } }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };
    const result = await commitPublishPlansWith(query, [plan(), plan({ supplier_sku: "GL-N125F-L" })]);
    expect(JSON.parse(payload)).toHaveLength(2);
    expect(result.productIds).toEqual(["parent"]);
  });

  it("refuses a plan that carries a customer price", async () => {
    const query: PrivateQuery = async () => ({ rows: [], rowCount: 0 });
    await expect(commitPublishPlansWith(query, [plan({ sell_price: 12 })])).rejects.toThrow(/sell price/i);
  });
});
