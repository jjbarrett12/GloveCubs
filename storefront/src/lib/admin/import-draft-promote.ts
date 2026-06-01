import type { ProductWriteInput } from "@/lib/admin/product-write";
import type { ImportDraftProductV1, ImportDraftVariantV1 } from "@/lib/admin/import-draft-types";

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
  /** Operator-supplied variants take precedence when non-empty. */
  variants?: ProductWriteInput["variants"];
};

function variantToWriteInput(v: ImportDraftVariantV1): ProductWriteInput["variants"][number] {
  return {
    sizeCode: v.normalized_size_code,
    variantSku: v.sku ?? v.mpn ?? "",
    listPrice: v.list_price ?? "",
  };
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
        variantSku: draft.sku ?? draft.mpn ?? "",
        listPrice: "",
      },
    ];
  }
  return [
    {
      sizeCode: "UNKNOWN",
      variantSku: draft.sku ?? draft.mpn ?? "",
      listPrice: "",
    },
  ];
}

export function importDraftToProductWriteInput(
  draft: ImportDraftProductV1,
  overrides: ImportDraftPromoteOverrides,
  options?: { stagingImageUrl?: string | null }
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

  const variants =
    overrides.variants && overrides.variants.length > 0
      ? overrides.variants
      : draftPromoteVariants(draft);

  return {
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
  };
}
