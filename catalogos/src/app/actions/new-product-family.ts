"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { parseFamilyDraft } from "@/lib/new-product-family/draft";
import { promoteFamilyToStaging } from "@/lib/new-product-family/promote";
import { liveFamilyPromotionPort } from "@/lib/new-product-family/promote-live";
import {
  listCatalogBrands,
  loadExistingGloveCubsSkus,
  loadFamilyDraftDocument,
  saveFamilyDraftDocument,
} from "@/lib/new-product-family/persist";
import type { NewProductFamilyDraft } from "@/lib/new-product-family/types";

const REVAL_PATHS = ["/dashboard/products/new-family", "/dashboard/staging", "/dashboard/review"];

export async function saveNewProductFamilyDraft(input: {
  draft: unknown;
  batchId?: string | null;
}): Promise<{ success: true; batchId: string } | { success: false; error: string }> {
  const draft = parseFamilyDraft(input.draft);
  if (!draft) return { success: false, error: "Invalid family draft." };
  const saved = await saveFamilyDraftDocument(draft, input.batchId);
  if (saved.success) {
    for (const p of REVAL_PATHS) revalidatePath(p);
  }
  return saved;
}

export async function loadNewProductFamilyDraft(
  batchId: string
): Promise<{ success: true; draft: NewProductFamilyDraft } | { success: false; error: string }> {
  return loadFamilyDraftDocument(batchId);
}

export async function listNewProductFamilyBrands(): Promise<{ id: string; name: string }[]> {
  return listCatalogBrands();
}

export async function promoteNewProductFamilyDraft(
  batchId: string
): Promise<
  | { success: true; batchId: string; masterProductId: string; normalizedIds: string[]; alreadyExisted: boolean }
  | { success: false; error: string }
> {
  const loaded = await loadFamilyDraftDocument(batchId);
  if (!loaded.success) return loaded;
  const skus = await loadExistingGloveCubsSkus(batchId);
  const supabase = getSupabaseCatalogos(true);
  const { data: category, error: categoryErr } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", loaded.draft.productType)
    .maybeSingle();
  if (categoryErr) return { success: false, error: categoryErr.message };
  if (!category?.id) return { success: false, error: `No category exists for ${loaded.draft.productType}.` };

  const promoted = await promoteFamilyToStaging({
    draft: loaded.draft,
    draftId: batchId,
    categoryId: category.id as string,
    collisions: {
      existingParentSkus: new Set(skus.parentSkus),
      existingVariantSkus: new Set(skus.variantSkus),
    },
    port: liveFamilyPromotionPort(),
  });
  if (!promoted.success) return promoted;
  for (const p of REVAL_PATHS) revalidatePath(p);
  return {
    success: true,
    batchId: promoted.batchId,
    masterProductId: promoted.masterProductId,
    normalizedIds: promoted.normalizedIds,
    alreadyExisted: promoted.alreadyExisted,
  };
}

export async function listExistingGloveCubsSkus(excludeDraftId?: string | null): Promise<
  | { success: true; parentSkus: string[]; variantSkus: string[] }
  | { success: false; error: string }
> {
  try {
    const skus = await loadExistingGloveCubsSkus(excludeDraftId);
    return { success: true, ...skus };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to check GloveCubs SKU collisions." };
  }
}
