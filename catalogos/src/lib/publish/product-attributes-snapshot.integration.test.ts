/**
 * Optional smoke test: PostgREST accepts product_attributes → attribute_definitions embed
 * and snapshot refresh runs against a real catalogos schema.
 *
 * Uses a random product UUID with no attribute rows → snapshot ok with {}.
 */

import { describe, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { refreshProductAttributesJsonSnapshot } from "./product-attributes-snapshot";

const hasDb =
  !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasDb)("refreshProductAttributesJsonSnapshot (integration)", () => {
  it("runs select with embed and update for a non-existent product id (empty snapshot)", async () => {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const client = createClient(url, key, { auth: { persistSession: false } }) as unknown as SupabaseClient;

    const ghostProductId = crypto.randomUUID();
    await client.from("product_attributes").delete().eq("product_id", ghostProductId);
    await client.from("products").delete().eq("id", ghostProductId);

    const { data: cat } = await client.from("categories").select("id").eq("slug", "disposable_gloves").maybeSingle();
    if (!cat || !(cat as { id: string }).id) {
      throw new Error("integration requires disposable_gloves category");
    }
    const categoryId = (cat as { id: string }).id;

    const { error: insProd } = await client.from("products").insert({
      id: ghostProductId,
      sku: `snap-int-${Date.now()}`,
      name: "Snapshot integration stub",
      category_id: categoryId,
      attributes: { legacy_key: "should_be_removed_after_snapshot" },
      is_active: false,
      slug: `snap-int-${Date.now()}`,
    });
    expect(insProd).toBeNull();

    const r = await refreshProductAttributesJsonSnapshot(client, ghostProductId);
    expect(r).toEqual({ ok: true });

    const { data: row } = await client.from("products").select("attributes").eq("id", ghostProductId).single();
    expect((row as { attributes: Record<string, unknown> }).attributes).toEqual({});

    await client.from("products").delete().eq("id", ghostProductId);
  });
});
