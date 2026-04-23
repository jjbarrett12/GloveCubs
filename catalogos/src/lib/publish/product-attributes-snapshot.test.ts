/**
 * Tests for product_attributes → products.attributes snapshot refresh.
 */

import { describe, it, expect, vi } from "vitest";
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

describe("refreshProductAttributesJsonSnapshot", () => {
  it("writes single-value and deduped multi-select arrays from joined rows", async () => {
    const updates: unknown[] = [];
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
        if (table === "products") {
          return {
            update: vi.fn((payload: unknown) => {
              updates.push(payload);
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const r = await refreshProductAttributesJsonSnapshot(supabase as never, "pid-1");
    expect(r).toEqual({ ok: true });
    expect(updates).toHaveLength(1);
    const payload = updates[0] as { attributes: Record<string, unknown> };
    expect(payload.attributes.material).toBe("nitrile");
    expect(payload.attributes.industries).toEqual(["healthcare", "food_service"]);
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
    const updates: unknown[] = [];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "product_attributes") return productAttributesChain(data);
        if (table === "products") {
          return {
            update: vi.fn((payload: unknown) => {
              updates.push(payload);
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    const r = await refreshProductAttributesJsonSnapshot(supabase as never, "pid-opt-a");
    expect(r).toEqual({ ok: true });
    const attrs = (updates[0] as { attributes: Record<string, unknown> }).attributes;
    expect(Object.keys(attrs).sort()).toEqual(["material"]);
    expect(attrs).not.toHaveProperty("legacy_key");
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
    const updates: unknown[] = [];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "product_attributes") return productAttributesChain(data);
        if (table === "products") {
          return {
            update: vi.fn((payload: unknown) => {
              updates.push(payload);
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    const r = await refreshProductAttributesJsonSnapshot(supabase as never, "pid-dup");
    expect(r).toEqual({ ok: true });
    expect((updates[0] as { attributes: { material: string } }).attributes.material).toBe("nitrile");
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
    let updateAttempts = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "product_attributes") return productAttributesChain(data);
        if (table === "products") {
          return {
            update: vi.fn(() => {
              updateAttempts++;
              return {
                eq: vi.fn().mockResolvedValue({
                  error: updateAttempts === 1 ? { message: "transient" } : null,
                }),
              };
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    const r = await refreshProductAttributesJsonSnapshot(supabase as never, "pid-4");
    expect(r).toEqual({ ok: true });
    expect(updateAttempts).toBe(2);
  });
});
