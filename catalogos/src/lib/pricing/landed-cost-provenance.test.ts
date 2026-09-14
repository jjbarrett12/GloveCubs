import { describe, expect, it } from "vitest";
import {
  COST_PROVENANCE_ACTOR,
  csvCostMappingTrust,
  guessCsvLandedCostColumnIndex,
  isGenericPriceHeader,
  offerProvenanceFromStaging,
  parseCostSourceType,
  stampUrlImportCostProvenance,
  withLandedCostProvenance,
} from "./landed-cost-provenance";

describe("landed cost provenance", () => {
  it("stores source type, reference, updated_at, and updated_by", () => {
    const row = withLandedCostProvenance(
      { cost: 85 },
      {
        sourceType: "supplier_quote",
        sourceReference: "Quote 2026-09-14",
        updatedBy: "op@glovecubs.com",
        updatedAt: "2026-09-14T16:00:00.000Z",
      }
    );
    expect(row.cost).toBe(85);
    expect(row.cost_source_type).toBe("supplier_quote");
    expect(row.cost_source_reference).toBe("Quote 2026-09-14");
    expect(row.cost_updated_at).toBe("2026-09-14T16:00:00.000Z");
    expect(row.cost_updated_by).toBe("op@glovecubs.com");
  });

  it("does not invent a person when actor is blank", () => {
    const row = withLandedCostProvenance({ cost: 10 }, { sourceType: "csv_import", updatedBy: "  " });
    expect(row.cost_updated_by).toBe(COST_PROVENANCE_ACTOR.catalogos_system);
  });

  it("copies staging provenance onto an offer write", () => {
    const p = offerProvenanceFromStaging(
      {
        cost_source_type: "supplier_invoice",
        cost_source_reference: "Invoice 48102",
        cost_updated_at: "2026-09-14T16:00:00.000Z",
        cost_updated_by: "op@glovecubs.com",
      },
      COST_PROVENANCE_ACTOR.catalogos_operator
    );
    expect(p).toEqual({
      cost_source_type: "supplier_invoice",
      cost_source_reference: "Invoice 48102",
      cost_updated_at: "2026-09-14T16:00:00.000Z",
      cost_updated_by: "op@glovecubs.com",
    });
  });

  it("does not invent a source type when staging has none", () => {
    expect(offerProvenanceFromStaging({ supplier_cost: 85 }, "admin")).toBeNull();
  });
});

describe("CSV landed-cost mapping", () => {
  it("does not auto-guess generic price as landed cost", () => {
    expect(guessCsvLandedCostColumnIndex(["sku", "name", "price"])).toBe("");
    expect(isGenericPriceHeader("price")).toBe(true);
    expect(csvCostMappingTrust("price")).toBe("needs_review");
  });

  it("trusts an explicit landed-case-cost column", () => {
    expect(guessCsvLandedCostColumnIndex(["sku", "Landed case cost", "name"])).toBe(1);
    expect(csvCostMappingTrust("landed_case_cost")).toBe("trusted_landed");
    expect(csvCostMappingTrust("normalized_case_cost")).toBe("trusted_landed");
  });

  it("marks a mapped cost/unit_cost header as needing review", () => {
    expect(csvCostMappingTrust("cost")).toBe("needs_review");
    expect(csvCostMappingTrust("unit_cost")).toBe("needs_review");
  });
});

describe("URL import provenance", () => {
  it("marks supplier page pricing as untrusted url_import", () => {
    const row = stampUrlImportCostProvenance(
      { sku: "X", cost: 42, source_url: "https://supplier.example/glove" },
      "https://supplier.example/glove"
    );
    expect(row.cost_source_type).toBe("url_import");
    expect(row.cost_updated_by).toBe(COST_PROVENANCE_ACTOR.url_import);
    expect(row.landed_cost_trusted).toBe(false);
    expect(row.cost_source_reference).toBe("https://supplier.example/glove");
  });

  it("accepts known source types only", () => {
    expect(parseCostSourceType("supplier_quote")).toBe("supplier_quote");
    expect(parseCostSourceType("price")).toBeNull();
  });
});
