/**
 * Server-side active publish readiness — mirrors ProductEditorShell / computeEditorReadiness.
 */

import { computeProductWarnings, type GovernanceWarning } from "@/lib/admin/catalog-governance";
import { initCommercePackagingFromEditor } from "@/lib/admin/commerce-packaging-editor";
import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";
import {
  computeEditorReadiness,
  hasPublishBlockers,
  readinessDetail,
  type EditorReadinessInput,
} from "@/lib/admin/product-editor-readiness";
import {
  fetchCategoryAttributeDefinitions,
  type AttributeDefinitionRow,
} from "@/lib/admin/product-attribute-sync";
import type { ProductWriteInput } from "@/lib/admin/product-write";
import {
  isUrlImportProductMetadata,
  URL_IMPORT_NON_ADMIN_PUBLISH_BLOCKED_MESSAGE,
} from "@/lib/admin/clipboard-promote-guards";
import {
  lookupSkuCollisions,
  normalizeSkuCollisionQuery,
  skuCollisionSetsForReadiness,
} from "@/lib/admin/sku-collision-lookup";
import type { EditorVariantRow } from "@/lib/admin/variant-generation";

export type ActivePublishReadinessContext = {
  metadata: Record<string, unknown>;
  productId?: string | null;
  importDraft?: ImportDraftProductV1 | null;
  /** Set when publish originates from authenticated admin product editor review. */
  adminReviewPublish?: boolean;
};

export type ActivePublishReadinessDeps = {
  categoryIdValid: boolean;
  categorySlug: string | null;
  attributeDefinitions: AttributeDefinitionRow[];
  skuCollisions?: {
    existingParentSkus: Set<string>;
    existingVariantSkus: Set<string>;
  };
};

function productWriteVariantsToEditorRows(variants: ProductWriteInput["variants"]): EditorVariantRow[] {
  return variants.map((v) => ({
    id: v.id,
    sizeCode: v.sizeCode,
    variantSku: v.variantSku,
    listPrice: v.listPrice,
    manufacturerSku: v.manufacturerSku ?? undefined,
    manufacturerSkuNeedsReview: v.manufacturerSkuNeedsReview,
    manufacturerSkuSource: v.manufacturerSkuSource,
  }));
}

function attributeKeysFromWrite(attributes: Record<string, string | string[]>): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(attributes)) {
    if (v === "" || v === null || (Array.isArray(v) && v.length === 0)) continue;
    keys.add(k);
  }
  return keys;
}

export function buildGovernanceWarningsForActiveWrite(
  input: ProductWriteInput,
  ctx: ActivePublishReadinessContext,
  categoryIdValid: boolean
): GovernanceWarning[] {
  const attrKeys = attributeKeysFromWrite(input.attributes);
  const imageRows = input.primaryImageUrl.trim() ? [{ metadata: null }] : [];
  const activeVariantCount = input.variants.filter((v) => v.sizeCode.trim() || v.variantSku.trim()).length;
  return computeProductWarnings({
    productId: ctx.productId?.trim() || "new",
    status: "active",
    metadata: ctx.metadata,
    imageRows,
    attributeRowCount: attrKeys.size,
    activeVariantCount,
    activeVariantGtins: [],
    activeVariantSignatures: [],
    categoryId: input.categoryId.trim() || null,
    categoryIdValid,
    attributeKeysWithValues: attrKeys,
    pendingMatchReviewCount: 0,
    globalGtinCollisionGtins: new Set(),
    globalSignatureCollisionKeys: new Set(),
  });
}

export function buildEditorReadinessInputFromProductWrite(
  input: ProductWriteInput,
  ctx: ActivePublishReadinessContext,
  deps: ActivePublishReadinessDeps
): EditorReadinessInput {
  const commercePackaging =
    input.commercePackaging ??
    initCommercePackagingFromEditor({
      metadata: ctx.metadata,
      importDraft: input.importDraft ?? ctx.importDraft ?? null,
      categorySlug: deps.categorySlug,
    });
  const allowedByKey = new Map(deps.attributeDefinitions.map((d) => [d.attributeKey, d.allowedValues]));
  return {
    brandName: input.brandName,
    categoryId: input.categoryId,
    primaryImageUrl: input.primaryImageUrl,
    publishIntent: true,
    quoteOnly: input.quoteOnly,
    attributes: input.attributes,
    variants: productWriteVariantsToEditorRows(input.variants),
    metadata: ctx.metadata,
    governanceWarnings: buildGovernanceWarningsForActiveWrite(input, ctx, deps.categoryIdValid),
    attributeDefinitions: deps.attributeDefinitions,
    dirty: false,
    importDraft: input.importDraft ?? ctx.importDraft ?? null,
    adminReviewPublish: ctx.adminReviewPublish ?? false,
    allowedByKey,
    commercePackaging,
    internalSku: input.internalSku ?? undefined,
    skuCollisions: deps.skuCollisions,
  };
}

/** Sync evaluator — reuses computeEditorReadiness; for tests and server write path. */
export function evaluateActivePublishReadinessSync(
  input: ProductWriteInput,
  ctx: ActivePublishReadinessContext,
  deps: ActivePublishReadinessDeps
): string | null {
  if (input.status !== "active") return null;

  if (isUrlImportProductMetadata(ctx.metadata) && !ctx.adminReviewPublish) {
    return URL_IMPORT_NON_ADMIN_PUBLISH_BLOCKED_MESSAGE;
  }

  if (!input.name.trim()) return "Product name is required to publish.";

  const readiness = computeEditorReadiness(buildEditorReadinessInputFromProductWrite(input, ctx, deps));
  if (!hasPublishBlockers(readiness)) return null;
  return readinessDetail(readiness);
}

async function fetchCategoryMeta(
  supabase: unknown,
  categoryId: string
): Promise<{ valid: boolean; slug: string | null }> {
  if (!categoryId.trim()) return { valid: false, slug: null };
  const { data } = await (supabase as any)
    .schema("catalogos")
    .from("categories")
    .select("slug")
    .eq("id", categoryId.trim())
    .maybeSingle();
  return {
    valid: Boolean(data),
    slug: typeof data?.slug === "string" ? data.slug : null,
  };
}

/** Server write path — fetches category defs and SKU collisions, then mirrors editor readiness. */
export async function evaluateActivePublishReadiness(
  supabase: unknown,
  input: ProductWriteInput,
  ctx: ActivePublishReadinessContext
): Promise<string | null> {
  if (input.status !== "active") return null;

  const categoryId = input.categoryId.trim();
  const [{ valid: categoryIdValid, slug: categorySlug }, attributeDefinitions] = await Promise.all([
    fetchCategoryMeta(supabase, categoryId),
    categoryId ? fetchCategoryAttributeDefinitions(categoryId) : Promise.resolve([]),
  ]);

  const parentSku = input.internalSku?.trim().toUpperCase() || null;
  const variantSkus = input.variants.map((v) => v.variantSku).filter(Boolean);
  const variantIds = input.variants.map((v) => v.id).filter(Boolean) as string[];

  let skuCollisions: ActivePublishReadinessDeps["skuCollisions"];
  if (parentSku || variantSkus.length > 0) {
    const collisionResult = await lookupSkuCollisions(
      normalizeSkuCollisionQuery({
        parentSku,
        variantSkus,
        excludeProductId: ctx.productId ?? null,
        excludeVariantIds: variantIds,
      })
    );
    skuCollisions = skuCollisionSetsForReadiness(collisionResult, {
      productId: ctx.productId ?? null,
      variantIds,
    });
  }

  return evaluateActivePublishReadinessSync(input, ctx, {
    categoryIdValid,
    categorySlug,
    attributeDefinitions,
    skuCollisions,
  });
}
