import type { ProductWriteInput } from "@/lib/admin/product-write";
import { resolveManufacturerSkuForVariantWrite } from "@/lib/admin/product-write";
import type { ImportDraftProductV1, ImportDraftVariantV1 } from "@/lib/admin/import-draft-types";
import { buildSkuProposalApplyPatch } from "@/lib/admin/import-suggestion-mapper";
import { initCommercePackagingFromEditor } from "@/lib/admin/commerce-packaging-editor";
import type { EditorVariantRow } from "@/lib/admin/variant-generation";

export type ImportDraftPromoteOverrides = {
  name?: string;
  brand_name?: string;
  material?: string;
  color?: string;
  mil_thickness?: string;
  case_pack?: string;
  description?: string;
  primary_image_url?: string;
  category_id: string;
  /** Selected catalog category slug (e.g. disposable_gloves) for packaging unit nouns. */
  category_slug?: string;
  /** Operator-supplied variants take precedence when non-empty. */
  variants?: ProductWriteInput["variants"];
  /** Applied GloveCubs parent SKU when operator confirmed proposals pre-promote. */
  internal_sku?: string;
};

export type ImportDraftPromoteOptions = {
  stagingImageUrl?: string | null;
  /** Apply safe GLV SKU proposals on promote (default true). */
  applySkuProposals?: boolean;
  /** Overwrite operator-provided SKU fields when applying proposals. */
  overwriteSkus?: boolean;
};

function variantToWriteInput(v: ImportDraftVariantV1): ProductWriteInput["variants"][number] {
  return {
    sizeCode: v.normalized_size_code,
    variantSku: "",
    listPrice: v.list_price ?? "",
    manufacturerSku: v.manufacturer_sku ?? v.source_sku ?? null,
  };
}

function attachManufacturerSkus(
  variants: ProductWriteInput["variants"],
  draft: ImportDraftProductV1
): ProductWriteInput["variants"] {
  return variants.map((row) => {
    const draftVar = draft.variants.find(
      (v) => v.normalized_size_code.trim().toUpperCase() === row.sizeCode.trim().toUpperCase()
    );
    return {
      ...row,
      manufacturerSku:
        row.manufacturerSku ??
        draftVar?.manufacturer_sku ??
        draftVar?.source_sku ??
        null,
    };
  });
}

/** Map normalized draft → catalog write input. Never silently defaults to OS. */
export function draftPromoteVariants(draft: ImportDraftProductV1): ProductWriteInput["variants"] {
  if (draft.variants.length > 0) {
    return draft.variants.map(variantToWriteInput);
  }
  if (draft.size) {
    return [
      {
        sizeCode: draft.size,
        variantSku: "",
        listPrice: "",
        manufacturerSku: null,
      },
    ];
  }
  return [
    {
      sizeCode: "UNKNOWN",
      variantSku: "",
      listPrice: "",
      manufacturerSku: null,
    },
  ];
}

function editorRowsFromWriteVariants(variants: ProductWriteInput["variants"]): EditorVariantRow[] {
  return variants.map((v) => ({
    sizeCode: v.sizeCode,
    variantSku: v.variantSku,
    listPrice: v.listPrice,
  }));
}

/** Apply safe SKU proposals onto promote write input (does not mutate draft). */
export function applySkuProposalsForPromote(
  draft: ImportDraftProductV1,
  input: ProductWriteInput,
  options?: { overwriteSkus?: boolean; currentInternalSku?: string }
): ProductWriteInput {
  const currentInternalSku = options?.currentInternalSku ?? input.internalSku ?? "";
  const { patch } = buildSkuProposalApplyPatch(
    draft,
    currentInternalSku,
    editorRowsFromWriteVariants(input.variants),
    { overwriteExisting: options?.overwriteSkus === true }
  );

  const variants = patch.variants
    ? attachManufacturerSkus(
        patch.variants.map((row) => ({
          sizeCode: row.sizeCode,
          variantSku: row.variantSku,
          listPrice: row.listPrice,
          manufacturerSku: null,
        })),
        draft
      )
    : input.variants;

  return {
    ...input,
    internalSku: patch.internalSku ?? input.internalSku ?? null,
    variants,
  };
}

export function importDraftToProductWriteInput(
  draft: ImportDraftProductV1,
  overrides: ImportDraftPromoteOverrides,
  options?: ImportDraftPromoteOptions
): ProductWriteInput {
  const name =
    overrides.name?.trim() ||
    draft.product_name?.trim() ||
    "Imported listing";
  const brandName = overrides.brand_name?.trim() || draft.brand?.trim() || "";
  const baseDesc = draft.description?.trim() ?? "";
  const description = [baseDesc, overrides.description?.trim(), `Source: ${draft.source_url}`]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 12000);
  const primaryImageUrl =
    overrides.primary_image_url?.trim() ||
    options?.stagingImageUrl?.trim() ||
    draft.image_url?.trim() ||
    "";

  let variants =
    overrides.variants && overrides.variants.length > 0
      ? attachManufacturerSkus(overrides.variants, draft)
      : draftPromoteVariants(draft);

  let base: ProductWriteInput = {
    name: name.slice(0, 300),
    brandName,
    categoryId: overrides.category_id,
    description,
    primaryImageUrl,
    status: "draft",
    quoteOnly: true,
    variants,
    attributes: {},
    importDraft: draft,
    internalSku: overrides.internal_sku?.trim() || null,
    commercePackaging: initCommercePackagingFromEditor({
      importDraft: draft,
      categorySlug: overrides.category_slug ?? draft.category_hint ?? null,
    }),
  };

  const applySku = options?.applySkuProposals !== false;
  if (applySku) {
    base = applySkuProposalsForPromote(draft, base, {
      overwriteSkus: options?.overwriteSkus,
      currentInternalSku: overrides.internal_sku ?? "",
    });
  }

  return base;
}

/** Preview catalog variant metadata rows for smoke tests (no DB). */
export function previewPromoteVariantRows(input: ProductWriteInput): Array<{
  size_code: string | null;
  variant_sku: string;
  metadata: Record<string, unknown>;
}> {
  return input.variants.map((v) => {
    const sizeKey = v.sizeCode.trim().toUpperCase() || "UNKNOWN";
    const mfr = resolveManufacturerSkuForVariantWrite(input, sizeKey, v);
    const metadata: Record<string, unknown> = {};
    if (mfr) metadata.manufacturer_sku = mfr;
    return {
      size_code: v.sizeCode.trim() || null,
      variant_sku: v.variantSku.trim(),
      metadata,
    };
  });
}
