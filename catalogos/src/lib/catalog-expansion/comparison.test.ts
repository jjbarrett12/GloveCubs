import { describe, it, expect } from "vitest";
import {
  externalIdFromRow,
  compareRow,
  runComparison,
} from "./comparison";
import type { PriorRow } from "./types";

describe("catalog-expansion comparison", () => {
  describe("externalIdFromRow", () => {
    it("uses sku when present", () => {
      expect(externalIdFromRow({ sku: "ABC-123" }, 0)).toBe("ABC-123");
    });
    it("uses id when present", () => {
      expect(externalIdFromRow({ id: "item-1" }, 0)).toBe("item-1");
    });
    it("falls back to index as string", () => {
      expect(externalIdFromRow({}, 5)).toBe("5");
    });
  });

  describe("compareRow", () => {
    it("detects title change", () => {
      const prior: PriorRow = {
        external_id: "SKU1",
        raw_id: "raw-1",
        raw_payload: { name: "Old Title" },
        normalized_id: null,
        normalized_data: {},
        attributes: {},
      };
      const result = compareRow({ name: "New Title" }, prior, "SKU1");
      expect(result.result_type).toBe("changed");
      expect(result.change_summary.title_changed).toBe(true);
    });

    it("detects cost change and sets requires_review", () => {
      const prior: PriorRow = {
        external_id: "SKU1",
        raw_id: "raw-1",
        raw_payload: { cost: 10 },
        normalized_id: null,
        normalized_data: {},
        attributes: {},
      };
      const result = compareRow({ cost: 12 }, prior, "SKU1");
      expect(result.result_type).toBe("changed");
      expect(result.change_summary.cost_old).toBe(10);
      expect(result.change_summary.cost_new).toBe(12);
      expect(result.requires_review).toBe(true);
    });

    it("returns unchanged when no diff", () => {
      const prior: PriorRow = {
        external_id: "SKU1",
        raw_id: "raw-1",
        raw_payload: { name: "Same", cost: 10 },
        normalized_id: null,
        normalized_data: {},
        attributes: {},
      };
      const result = compareRow({ name: "Same", cost: 10 }, prior, "SKU1");
      expect(result.result_type).toBe("unchanged");
    });
  });

  describe("runComparison", () => {
    it("marks current-only as new", () => {
      const currentRows = [{ external_id: "NEW1", row: { sku: "NEW1" } }];
      const priorMap = new Map<string, PriorRow>();
      const results = runComparison(currentRows, priorMap);
      expect(results).toHaveLength(1);
      expect(results[0].result_type).toBe("new");
      expect(results[0].external_id).toBe("NEW1");
    });

    it("marks prior-only as missing", () => {
      const prior: PriorRow = {
        external_id: "MISS1",
        raw_id: "r1",
        raw_payload: {},
        normalized_id: null,
        normalized_data: {},
        attributes: {},
      };
      const priorMap = new Map([["MISS1", prior]]);
      const results = runComparison([], priorMap);
      expect(results).toHaveLength(1);
      expect(results[0].result_type).toBe("missing");
      expect(results[0].external_id).toBe("MISS1");
      expect(results[0].prior_raw_id).toBe("r1");
    });

    it("combines new, changed, missing", () => {
      const prior: PriorRow = {
        external_id: "P1",
        raw_id: "r1",
        raw_payload: { cost: 5 },
        normalized_id: null,
        normalized_data: {},
        attributes: {},
      };
      const priorMap = new Map([["P1", prior]]);
      const currentRows = [
        { external_id: "NEW1", row: {} },
        { external_id: "P1", row: { cost: 8 } },
      ];
      const results = runComparison(currentRows, priorMap);
      expect(results).toHaveLength(2);
      expect(results.find((r) => r.external_id === "NEW1")?.result_type).toBe("new");
      expect(results.find((r) => r.external_id === "P1")?.result_type).toBe("changed");
    });
  });
});
