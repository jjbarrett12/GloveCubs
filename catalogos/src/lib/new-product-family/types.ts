/**
 * New Product Family draft.
 * Cost fields are supplier quote and landed case cost only.
 * Customer list price is approved later in storefront admin.
 */

import type { ProductTypeKey } from "@/lib/product-types";
import { SIZE_VALUES } from "@/lib/catalogos/attribute-dictionary-types";

export const NEW_PRODUCT_FAMILY_SCHEMA = "glovecubs.new_product_family.v1" as const;
export const NEW_PRODUCT_FAMILY_DRAFT_HEADER = "glovecubs.new_product_family.v1" as const;
export const NEW_PRODUCT_FAMILY_FILENAME = "new-family-wizard" as const;

export type FamilySizeSlug = (typeof SIZE_VALUES)[number];

export type ManufacturerSkuStatus = "incomplete" | "suggested" | "confirmed";

export type FamilyVariantRow = {
  size: FamilySizeSlug;
  manufacturerSku: string;
  supplierSku: string;
  /** Optional UPC/GTIN for this size. */
  gtin?: string;
  manufacturerConfirmed: boolean;
  suggestedManufacturerSku: string | null;
};

export type FamilyPackaging = {
  unitsPerInner: number | null;
  innersPerCase: number | null;
  /** Optional. Omitted or null when the pallet count is unknown. */
  casesPerPallet?: number | null;
};

export type FamilySizeCost = {
  quotedCaseCost: number | null;
  landedCaseCost: number | null;
};

export type NewProductFamilyDraft = {
  schemaVersion: typeof NEW_PRODUCT_FAMILY_SCHEMA;
  productType: ProductTypeKey;
  brand: string;
  brandId: string | null;
  material: string;
  grade: string;
  color: string;
  title: string;
  titleTouched: boolean;
  powder: string;
  thicknessMil: string;
  texture: string;
  sterility: string;
  aql: string;
  certifications: string[];
  sizes: FamilySizeSlug[];
  supplierSkuMirrorsManufacturer: boolean;
  manufacturerSkuExample: string;
  variants: Record<string, FamilyVariantRow>;
  samePackagingForAllSizes: boolean;
  packaging: FamilyPackaging;
  packagingBySize: Record<string, FamilyPackaging>;
  cuffStyle: string;
  tensile: string;
  elongation: string;
  punctureNote: string;
  chemicalResistance: string;
  supplierId: string | null;
  costSourceType: string;
  costSourceReference: string;
  sameCostForAllSizes: boolean;
  quotedCaseCost: number | null;
  landedCaseCost: number | null;
  /** Operator confirms landed case cost is real and is not a customer price. */
  landedCostConfirmed: boolean;
  costBySize: Record<string, FamilySizeCost>;
  imageUrl: string;
};

export const WIZARD_STEPS = [
  { id: 1, key: "identity", label: "Identity", phase: 1 },
  { id: 2, key: "specifications", label: "Specifications", phase: 1 },
  { id: 3, key: "sizes", label: "Size family", phase: 1 },
  { id: 4, key: "packaging", label: "Packaging", phase: 1 },
  { id: 5, key: "cost", label: "Supplier & landed cost", phase: 1 },
  { id: 6, key: "pricing", label: "Pricing", phase: 1 },
  { id: 7, key: "review", label: "Review & publish", phase: 1 },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

export type StepGate = {
  complete: boolean;
  canAdvance: boolean;
  blockReason: string | null;
};

export const PRIMARY_THICKNESS_MILS = ["2", "3", "4", "5", "6", "8"] as const;
export const PRIMARY_COLORS = ["blue", "blue_violet", "black", "white", "purple", "violet", "green"] as const;
export const PRIMARY_TEXTURES = ["smooth", "fingertip_textured", "fully_textured", "micro_textured"] as const;
export const GLOVES_PER_BOX_PRESETS = [100, 200, 250, 300] as const;
export const BOXES_PER_CASE_PRESETS = [10, 20] as const;
export const DEFAULT_FAMILY_SIZES: FamilySizeSlug[] = [];
export const XS_XL_FAMILY_SIZES: FamilySizeSlug[] = ["xs", "s", "m", "l", "xl"];
export const MEDICAL_AQL_VALUES = ["aql_1_5", "aql_2_5", "aql_4_0"] as const;
export const MEDICAL_CERT_TOGGLES = ["astm_d6319", "fda_510k"] as const;
export const FOOD_CERT_TOGGLES = ["fda_food_contact", "food_safe"] as const;

export function isMedicalOrSurgicalGrade(grade: string): boolean {
  return grade === "medical_exam_grade" || grade === "surgical_grade";
}

export function isFoodServiceGrade(grade: string): boolean {
  return grade === "food_service_grade";
}
