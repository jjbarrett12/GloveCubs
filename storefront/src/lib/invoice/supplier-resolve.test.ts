import { describe, expect, it } from "vitest";
import { resolveInvoiceVendor } from "@/lib/invoice/supplier-resolve";

function mockExactThenFuzzy(exactRows: unknown[], fuzzyRows: unknown[]) {
  return {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            ilike: (_c: string, pattern: string) => ({
              limit: () => {
                if (!String(pattern).includes("%")) {
                  return Promise.resolve({ data: exactRows, error: null });
                }
                return Promise.resolve({ data: fuzzyRows, error: null });
              },
            }),
          }),
        }),
      }),
    }),
  };
}

describe("resolveInvoiceVendor", () => {
  it("returns no_match for empty vendor", async () => {
    const r = await resolveInvoiceVendor({}, "");
    expect(r.review_status).toBe("no_match");
    expect(r.method).toBe("none");
  });

  it("returns exact_ilike with pending_review for single exact match", async () => {
    const supabase = mockExactThenFuzzy([{ id: "s1", name: "Acme Medical" }], []);
    const r = await resolveInvoiceVendor(supabase as any, "acme medical");
    expect(r.method).toBe("exact_ilike");
    expect(r.catalogos_supplier_id).toBe("s1");
    expect(r.review_status).toBe("pending_review");
  });

  it("returns ambiguous when multiple exact-tier matches", async () => {
    const supabase = mockExactThenFuzzy(
      [
        { id: "a", name: "X" },
        { id: "b", name: "Y" },
      ],
      []
    );
    const r = await resolveInvoiceVendor(supabase as any, "vendor");
    expect(r.review_status).toBe("ambiguous");
    expect(r.catalogos_supplier_id).toBeNull();
  });

  it("returns fuzzy_ilike with review_required for single fuzzy match", async () => {
    const supabase = mockExactThenFuzzy([], [{ id: "f1", name: "Contoso Gloves Inc" }]);
    const r = await resolveInvoiceVendor(supabase as any, "Gloves");
    expect(r.method).toBe("fuzzy_ilike");
    expect(r.review_status).toBe("review_required");
    expect(r.catalogos_supplier_id).toBe("f1");
  });
});
