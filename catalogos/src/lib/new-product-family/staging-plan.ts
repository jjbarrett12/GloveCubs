import { normalizeCommercePackaging } from "@commerce-packaging/labels";
import { CATALOGOS_SKU_PROPOSALS_SCHEMA_VERSION } from "@/lib/sku-intelligence/types";
import type { CostSourceType } from "@/lib/pricing/landed-cost-provenance";
import { parseCostSourceType } from "@/lib/pricing/landed-cost-provenance";
import { evaluateFamilyCost } from "./cost";
import { familyGroupKey } from "./draft";
import { evaluateFamilyPackaging, packagingFacetSlugs, packagingForSize } from "./packaging";
import {
  deriveFamilyGloveCubsSkus,
  effectiveSupplierSku,
  familySkuCollisionIssues,
  sizeSlugToCode,
  type SkuCollisionInput,
} from "./sku-assist";
import type { FamilySizeSlug, NewProductFamilyDraft } from "./types";

export type FamilyStagingRowPlan = {
  size: FamilySizeSlug;
  sizeCode: string;
  variantSku: string;
  supplierSku: string;
  manufacturerSku: string;
  gtin: string | null;
  externalId: string;
  name: string;
  quotedCaseCost: number;
  landedCaseCost: number;
  rawPayload: Record<string, unknown>;
  normalizedDataExtra: Record<string, unknown>;
};

export type FamilyStagingPlan = {
  ok: true;
  parentSku: string;
  familyGroupKey: string;
  supplierId: string;
  categorySlug: string;
  brandId: string | null;
  title: string;
  imageUrl: string;
  costSourceType: CostSourceType;
  costSourceReference: string;
  rows: FamilyStagingRowPlan[];
};

export type FamilyStagingPlanResult = FamilyStagingPlan | { ok: false; error: string };

function commercePackagingFor(draft: NewProductFamilyDraft, size: FamilySizeSlug) {
  const pack = packagingForSize(draft, size);
  const cp = normalizeCommercePackaging(
    {
      inner_unit_type: "box",
      units_per_inner: pack.unitsPerInner,
      inners_per_case: pack.innersPerCase,
      cases_per_pallet: pack.casesPerPallet ?? null,
      units_per_case_overridden: false,
      sell_by_case_enabled: true,
      sell_by_pallet_enabled: false,
      case_price: null,
      pallet_price: null,
      compare_at_case_price: null,
      compare_at_pallet_price: null,
      msrp_per_case: null,
      standard_cost_per_case: null,
    },
    draft.productType
  );
  return cp;
}

function filterAttributesFor(draft: NewProductFamilyDraft, sizeCode: string, packagingSlug: string) {
  const certifications = [...draft.certifications];
  if (draft.aql && !certifications.includes(draft.aql)) certifications.push(draft.aql);
  const protection: string[] = [];
  if (draft.chemicalResistance.trim()) protection.push("chemical_resistant");
  if (draft.punctureNote.trim()) protection.push("puncture_resistant");
  const attrs: Record<string, unknown> = {
    category: draft.productType,
    material: draft.material,
    color: draft.color,
    brand: draft.brand.trim(),
    packaging: packagingSlug,
    powder: draft.powder,
    grade: draft.grade,
    thickness_mil: draft.thicknessMil,
    size: sizeCode,
  };
  if (draft.texture) attrs.texture = draft.texture;
  if (draft.cuffStyle) attrs.cuff_style = draft.cuffStyle;
  if (draft.sterility) attrs.sterility = draft.sterility;
  if (certifications.length > 0) attrs.certifications = certifications;
  if (protection.length > 0) attrs.protection_tags = protection;
  return attrs;
}

function specificationsFor(draft: NewProductFamilyDraft): Record<string, string> | null {
  const specs: Record<string, string> = {};
  if (draft.tensile.trim()) specs.tensile = draft.tensile.trim();
  if (draft.elongation.trim()) specs.elongation = draft.elongation.trim();
  if (draft.punctureNote.trim()) specs.puncture = draft.punctureNote.trim();
  if (draft.chemicalResistance.trim()) specs.chemical_resistance = draft.chemicalResistance.trim();
  return Object.keys(specs).length > 0 ? specs : null;
}

export function buildFamilyStagingPlan(
  draft: NewProductFamilyDraft,
  draftId: string,
  collisions: SkuCollisionInput
): FamilyStagingPlanResult {
  const pack = evaluateFamilyPackaging(draft);
  if (!pack.complete) return { ok: false, error: pack.blockReason ?? "Packaging is incomplete." };
  const cost = evaluateFamilyCost(draft);
  if (!cost.trusted) {
    return { ok: false, error: cost.blockReason ?? "Landed case cost is not confirmed." };
  }
  const image = draft.imageUrl.trim();
  if (!image || !/^https:\/\//i.test(image) || /placeholder/i.test(image)) {
    return { ok: false, error: "A real https product image URL is required before staging." };
  }
  const issues = familySkuCollisionIssues(draft, collisions);
  if (issues.length > 0) return { ok: false, error: issues[0]!.label };
  const derived = deriveFamilyGloveCubsSkus(draft);
  if (!derived.parentSku) return { ok: false, error: "GloveCubs parent SKU could not be generated." };
  const sourceType = parseCostSourceType(draft.costSourceType);
  if (!sourceType || !draft.supplierId) return { ok: false, error: "Supplier and cost source are required." };

  const title = draft.title.trim();
  const groupKey = familyGroupKey(draft, derived.parentSku);
  const specs = specificationsFor(draft);
  const rows: FamilyStagingRowPlan[] = [];

  for (const size of draft.sizes) {
    const sizeCode = sizeSlugToCode(size);
    const variantSku = derived.bySize[size];
    const amounts = cost.bySize[size];
    const supplierSku = effectiveSupplierSku(draft, size);
    const manufacturerSku = draft.variants[size]?.manufacturerSku.trim() ?? "";
    if (!variantSku || !amounts || !supplierSku || !manufacturerSku) {
      return { ok: false, error: `Size ${sizeCode} is missing a SKU or landed case cost.` };
    }
    const facets = packagingFacetSlugs(packagingForSize(draft, size));
    if (!facets.packaging) {
      return { ok: false, error: `Size ${sizeCode} packaging does not map to a storefront facet.` };
    }
    const gtin = draft.variants[size]?.gtin?.trim() || null;
    const filterAttributes = filterAttributesFor(draft, sizeCode, facets.packaging);
    const commerce = commercePackagingFor(draft, size);
    const normalizedDataExtra: Record<string, unknown> = {
      brand: draft.brand.trim(),
      supplier_sku: supplierSku,
      sku: variantSku,
      manufacturer_sku: manufacturerSku,
      manufacturer_part_number: manufacturerSku,
      supplier_quoted_case_cost: amounts.quotedCaseCost,
      filter_attributes: filterAttributes,
      commerce_packaging: commerce,
      images: [image],
      new_product_family: true,
      quick_add: false,
      sku_proposals: {
        schema_version: CATALOGOS_SKU_PROPOSALS_SCHEMA_VERSION,
        proposed_parent_sku: derived.parentSku,
        parent_confidence: null,
        parent_source: "new_product_family",
        parent_warnings: [],
        applied_parent_sku: derived.parentSku,
        applied_variant_skus: { [sizeCode]: variantSku },
        variants: [
          {
            size_code: sizeCode,
            manufacturer_sku: manufacturerSku,
            proposed_glovecubs_sku: variantSku,
            confidence: null,
            source: "new_product_family",
            warnings: [],
          },
        ],
        warnings: [],
      },
    };
    if (gtin) {
      normalizedDataExtra.gtin = gtin;
      normalizedDataExtra.upc = gtin;
    }
    if (specs) normalizedDataExtra.specifications = specs;
    if (facets.box_quantity) (filterAttributes as { box_quantity?: string }).box_quantity = facets.box_quantity;
    if (facets.case_quantity) (filterAttributes as { case_quantity?: string }).case_quantity = facets.case_quantity;

    rows.push({
      size,
      sizeCode,
      variantSku,
      supplierSku,
      manufacturerSku,
      gtin,
      externalId: `${draftId}:${size}`,
      name: title,
      quotedCaseCost: amounts.quotedCaseCost,
      landedCaseCost: amounts.landedCaseCost,
      rawPayload: {
        source: "new_product_family",
        draft_id: draftId,
        size: sizeCode,
        variant_sku: variantSku,
        supplier_sku: supplierSku,
        manufacturer_sku: manufacturerSku,
        quoted_case_cost: amounts.quotedCaseCost,
        landed_case_cost: amounts.landedCaseCost,
      },
      normalizedDataExtra,
    });
  }

  return {
    ok: true,
    parentSku: derived.parentSku,
    familyGroupKey: groupKey,
    supplierId: draft.supplierId,
    categorySlug: draft.productType,
    brandId: draft.brandId,
    title,
    imageUrl: image,
    costSourceType: sourceType,
    costSourceReference: draft.costSourceReference.trim(),
    rows,
  };
}
