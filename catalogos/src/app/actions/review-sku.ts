"use server";

import { getSupabaseCatalogos } from "@/lib/db/client";
import { applySkuProposalsToNormalizedData } from "@/lib/sku-intelligence/staging-sku-proposals";
import { revalidatePath } from "next/cache";

export async function applyStagedSkuProposalsAction(
  normalizedId: string,
  options?: { overwrite?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseCatalogos(true);
  const { data: row, error: fetchErr } = await supabase
    .from("supplier_products_normalized")
    .select("normalized_data")
    .eq("id", normalizedId)
    .maybeSingle();

  if (fetchErr) return { success: false, error: fetchErr.message };
  if (!row) return { success: false, error: "Staged row not found" };

  const nd = (row as { normalized_data?: Record<string, unknown> }).normalized_data ?? {};
  const next = applySkuProposalsToNormalizedData(nd, { overwrite: options?.overwrite });

  const { error: updateErr } = await supabase
    .from("supplier_products_normalized")
    .update({ normalized_data: next, updated_at: new Date().toISOString() })
    .eq("id", normalizedId);

  if (updateErr) return { success: false, error: updateErr.message };

  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard/quick-add");
  return { success: true };
}
