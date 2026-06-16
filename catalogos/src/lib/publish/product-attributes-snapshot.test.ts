/**
 * Tests for product_attributes → products.attributes snapshot refresh.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import * as dbClient from "@/lib/db/client";
import { refreshProductAttributesJsonSnapshot } from "./product-attributes-snapshot";

function productAttributesChain(data: unknown[]) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data, error: null }),
        })),
      })),
    })),
  };
}

function catalogV2AdminMock(opts?: {
  existingMetadata?: Record<string, unknown>;
  updateError?: { message: string } | null;
  updateAttemptsRef?: { count: number };
}) {
  const metadataUpdates: unknown[] = [];
  const adminMock = {
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => {
        if (table !== "catalog_products") {
          throw new Error(`unexpected catalog_v2 table in snapshot mock: ${table}`);
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { metadata: opts?.existingMetadata ?? {} },
                error: null,
              }),
            })),
          })),
          update: vi.fn((payload: unknown) => {
            metadataUpdates.push(payload);
            if (opts?.updateAttemptsRef) opts.updateAttemptsRef.count += 1;
            const attempt = opts?.updateAttemptsRef?.count ?? 1;
            const error =
              opts?.updateError ??
              (opts?.updateAttemptsRef && attempt === 1 ? { message: "transient" } : null);
            return {
              eq: vi.fn().mockResolvedValue({ error: error ?? null }),
            };
          }),
        };
      }),
    })),
  };
  return { adminMock, metadataUpdates };
}

describe("refreshProductAttributesJsonSnapshot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes single-value and deduped multi-select arrays from joined rows", async () => {
    const { adminMock, metadataUpdates } = catalogV2AdminMock();
    vi.spyOn(dbClient, "getSupabase").mockReturnValue(adminMock as never);
    const data = [
      {
        value_text: "nitrile",
        value_number: null,
        value_boolean: null,
        attribute_definitions: { attribute_key: "material" },
      },
      {
        value_text: "healthcare",
        value_number: null,
        value_boolean: null,
        attribute_definitions: { attribute_key: "industries" },
      },
      {
        value_text: "food_service",
        value_number: null,
        value_boolean: null,
        attribute_definitions: { attribute_key: "industries" },
      },
      {
        value_text: "healthcare",
        value_number: null,
        value_boolean: null,
        attribute_definitions: { attribute_key: "industries" },
      },
    ];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "product_attributes") return productAttributesChain(data);
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const r = await refreshProductAttributesJsonSnapshot(supabase as never, "pid-1");
    expect(r).toEqual({ ok: true });
    expect(metadataUpdates).toHaveLength(1);
    const facetAttributes = (metadataUpdates[0] as { metadata: { facet_attributes: Record<string, unknown> } })
      .metadata.facet_attributes;
    expect(facetAttributes.material).toBe("nitrile");
    expect(facetAttributes.industries).toEqual(["healthcare", "food_service"]);
  });

  it("Option A: JSON snapshot contains only keys derived from product_attributes (no extra keys)", async () => {
    const data = [
      {
        value_text: "nitrile",
        value_number: null,
        value_boolean: null,
        attribute_definitions: { attribute_key: "material" },
      },
    ];
    const { adminMock, metadataUpdates } = catalogV2AdminMock({
      existingMetadata: { legacy_key: "keep_me" },
    });
    vi.spyOn(dbClient, "getSupabase").mockReturnValue(adminMock as never);
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "product_attributes") return productAttributesChain(data);
        throw new Error(`unexpected table ${table}`);
      }),
    };
    const r = await refreshProductAttributesJsonSnapshot(supabase as never, "pid-opt-a");
    expect(r).toEqual({ ok: true });
    const meta = (metadataUpdates[0] as { metadata: Record<string, unknown> }).metadata;
    const facetAttributes = meta.facet_attributes as Record<string, unknown>;
    expect(Object.keys(facetAttributes).sort()).toEqual(["material"]);
    expect(facetAttributes).not.toHaveProperty("legacy_key");
    expect(meta.legacy_key).toBe("keep_me");
  });

  it("returns ok: false when product_attributes select errors", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
            })),
          })),
        })),
      })),
    };
    const r = await refreshProductAttributesJsonSnapshot(supabase as never, "pid-2");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("boom");
  });

  it("allows duplicate single-select rows with identical value", async () => {
    const data = [
      {
        value_text: "nitrile",
        value_number: null,
        value_boolean: null,
        attribute_definitions: { attribute_key: "material" },
      },
      {
        value_text: "nitrile",
        value_number: null,
        value_boolean: null,
        attribute_definitions: { attribute_key: "material" },
      },
    ];
    const { adminMock, metadataUpdates } = catalogV2AdminMock();
    vi.spyOn(dbClient, "getSupabase").mockReturnValue(adminMock as never);
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "product_attributes") return productAttributesChain(data);
        throw new Error(`unexpected table ${table}`);
      }),
    };
    const r = await refreshProductAttributesJsonSnapshot(supabase as never, "pid-dup");
    expect(r).toEqual({ ok: true });
    expect(
      (metadataUpdates[0] as { metadata: { facet_attributes: { material: string } } }).metadata.facet_attributes
        .material
    ).toBe("nitrile");
  });

  it("fails on conflicting single-select values for one attribute_key", async () => {
    const data = [
      {
        value_text: "nitrile",
        value_number: null,
        value_boolean: null,
        attribute_definitions: { attribute_key: "material" },
      },
      {
        value_text: "latex",
        value_number: null,
        value_boolean: null,
        attribute_definitions: { attribute_key: "material" },
      },
    ];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "product_attributes") return productAttributesChain(data);
        if (table === "products") {
          return {
            update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    const r = await refreshProductAttributesJsonSnapshot(supabase as never, "pid-3");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain("material");
      expect(r.message).toContain("Conflicting");
    }
  });

  it("retries products update once after first failure", async () => {
    const data = [
      {
        value_text: "nitrile",
        value_number: null,
        value_boolean: null,
        attribute_definitions: { attribute_key: "material" },
      },
    ];
    const updateAttemptsRef = { count: 0 };
    const { adminMock } = catalogV2AdminMock({ updateAttemptsRef });
    vi.spyOn(dbClient, "getSupabase").mockReturnValue(adminMock as never);
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "product_attributes") return productAttributesChain(data);
        throw new Error(`unexpected table ${table}`);
      }),
    };
    const r = await refreshProductAttributesJsonSnapshot(supabase as never, "pid-4");
    expect(r).toEqual({ ok: true });
    expect(updateAttemptsRef.count).toBe(2);
  });
});
