import { describe, it, expect, vi } from "vitest";
import { allocateBulkCsvExternalId } from "@/lib/ingestion/bulk-csv-external-id";

const BATCH = "550e8400-e29b-41d4-a716-446655440000";

describe("allocateBulkCsvExternalId", () => {
  it("uses SKU on first occurrence; duplicate SKU in same batch gets deterministic synthetic ids", () => {
    const assigned = new Set<string>();
    const a = allocateBulkCsvExternalId(BATCH, 1, "GL-100", assigned);
    const b = allocateBulkCsvExternalId(BATCH, 2, "GL-100", assigned);
    const c = allocateBulkCsvExternalId(BATCH, 3, "GL-100", assigned);
    expect(a).toBe("GL-100");
    expect(b).toBe(`csv_bulk:${BATCH}:row:2`);
    expect(c).toBe(`csv_bulk:${BATCH}:row:3`);
    expect(assigned.size).toBe(3);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("missing SKU rows each get unique csv_bulk ids keyed by row index", () => {
    const assigned = new Set<string>();
    const r1 = allocateBulkCsvExternalId(BATCH, 1, "", assigned);
    const r2 = allocateBulkCsvExternalId(BATCH, 2, "", assigned);
    const r5 = allocateBulkCsvExternalId(BATCH, 5, "", assigned);
    expect(r1).toBe(`csv_bulk:${BATCH}:row:1`);
    expect(r2).toBe(`csv_bulk:${BATCH}:row:2`);
    expect(r5).toBe(`csv_bulk:${BATCH}:row:5`);
    expect(new Set([r1, r2, r5]).size).toBe(3);
  });

  it("does not collide when a real SKU matches the old __csv_row_<n> pattern", () => {
    const assigned = new Set<string>();
    const sku = "__csv_row_2";
    const real = allocateBulkCsvExternalId(BATCH, 1, sku, assigned);
    const missingRow2 = allocateBulkCsvExternalId(BATCH, 2, "", assigned);
    expect(real).toBe("__csv_row_2");
    expect(missingRow2).toBe(`csv_bulk:${BATCH}:row:2`);
    expect(real).not.toBe(missingRow2);
  });

  it("when synthetic base is already taken, appends uuid suffix until unique", () => {
    const assigned = new Set<string>();
    const base = `csv_bulk:${BATCH}:row:4`;
    assigned.add(base);
    const spy = vi.spyOn(crypto, "randomUUID").mockReturnValue("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    const id = allocateBulkCsvExternalId(BATCH, 4, "", assigned);
    spy.mockRestore();
    expect(id).toBe(`${base}:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`);
    expect(assigned.has(id)).toBe(true);
  });

  it("does not use SKU as external_id if that string was already reserved by a prior synthetic", () => {
    const assigned = new Set<string>();
    const syntheticFirst = allocateBulkCsvExternalId(BATCH, 1, "", assigned);
    expect(syntheticFirst).toBe(`csv_bulk:${BATCH}:row:1`);
    const literalSku = syntheticFirst;
    const second = allocateBulkCsvExternalId(BATCH, 2, literalSku, assigned);
    expect(second).not.toBe(literalSku);
    expect(second.startsWith(`csv_bulk:${BATCH}:row:2`)).toBe(true);
  });
});
