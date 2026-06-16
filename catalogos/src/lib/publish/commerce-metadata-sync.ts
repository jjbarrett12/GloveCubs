import type { SupabaseClient } from "@supabase/supabase-js";
import { applyCommercePackagingToMetadata } from "@commerce-packaging/metadata-mirror";
import { getCommercePackagingFromNormalized } from "@commerce-packaging/staging-bridge";

/** Write metadata.commerce_packaging (+ legacy mirrors) onto catalog_v2.catalog_products. */
export async function syncCommercePackagingToCatalogV2Metadata(
  admin: SupabaseClient,
  productId: string,
  normalizedData: Record<string, unknown>
): Promise<{ ok: boolean; message?: string }> {
  const cp = getCommercePackagingFromNormalized(normalizedData);
  if (!cp) return { ok: true };

  const { data: existing, error: readErr } = await admin
    .schema("catalog_v2")
    .from("catalog_products")
    .select("metadata")
    .eq("id", productId)
    .maybeSingle();

  if (readErr) {
    return { ok: false, message: readErr.message };
  }

  const meta = { ...(((existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>) };
  applyCommercePackagingToMetadata(meta, cp);

  const { error: updErr } = await admin
    .schema("catalog_v2")
    .from("catalog_products")
    .update({ metadata: meta, updated_at: new Date().toISOString() })
    .eq("id", productId);

  if (updErr) {
    return { ok: false, message: updErr.message };
  }
  return { ok: true };
}
