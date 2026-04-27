import { describe, it, expect } from "vitest";
import { matchToMaster, type MasterProductRow } from "./match-service";

const CAT = "cat-1";
const MASTER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function row(partial: Partial<MasterProductRow> & Pick<MasterProductRow, "id" | "sku" | "name">): MasterProductRow {
  return {
    category_id: CAT,
    attributes: {},
    ...partial,
  };
}

describe("matchToMaster contract", () => {
  it("when matched is false, masterProductId is always null (low attribute / fuzzy confidence)", async () => {
    const candidates: MasterProductRow[] = [
      row({
        id: MASTER_A,
        sku: "OTHER-SKU",
        name: "Unrelated catalog title xyz",
        attributes: { brand: "OtherBrand" },
      }),
    ];
    const r = await matchToMaster({
      normalized: {
        name: "Unique supplier title qwerty zephyr",
        brand: "Acme",
        attributes: { material: "nitrile" },
      },
      categoryId: CAT,
      supplierSku: "NOT-FOUND",
      masterCandidates: candidates,
    });
    expect(r.matched).toBe(false);
    expect(r.masterProductId).toBeNull();
  });

  it("SKU rule match yields matched true and non-null masterProductId", async () => {
    const candidates: MasterProductRow[] = [
      row({ id: MASTER_A, sku: "LINK-ME", name: "Nitrile glove", attributes: {} }),
    ];
    const r = await matchToMaster({
      normalized: { name: "Anything" },
      categoryId: CAT,
      supplierSku: "link-me",
      masterCandidates: candidates,
    });
    expect(r.matched).toBe(true);
    expect(r.masterProductId).toBe(MASTER_A);
    expect(r.reason).toBe("attribute_match");
  });
});
