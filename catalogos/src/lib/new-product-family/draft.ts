import { DEFAULT_PRODUCT_TYPE_KEY } from "@/lib/product-types";
import { SIZE_VALUES } from "@/lib/catalogos/attribute-dictionary-types";
import {
  DEFAULT_FAMILY_SIZES,
  FOOD_CERT_TOGGLES,
  MEDICAL_CERT_TOGGLES,
  NEW_PRODUCT_FAMILY_SCHEMA,
  isFoodServiceGrade,
  isMedicalOrSurgicalGrade,
  type FamilyPackaging,
  type FamilySizeSlug,
  type FamilyVariantRow,
  type NewProductFamilyDraft,
} from "./types";

export function emptyPackaging(): FamilyPackaging {
  return { unitsPerInner: null, innersPerCase: null };
}

export function emptyVariantRow(size: FamilySizeSlug): FamilyVariantRow {
  return {
    size,
    manufacturerSku: "",
    supplierSku: "",
    gtin: "",
    manufacturerConfirmed: false,
    suggestedManufacturerSku: null,
  };
}

export function sortFamilySizes(sizes: FamilySizeSlug[]): FamilySizeSlug[] {
  const order = SIZE_VALUES as readonly string[];
  return [...new Set(sizes)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function createEmptyFamilyDraft(): NewProductFamilyDraft {
  return {
    schemaVersion: NEW_PRODUCT_FAMILY_SCHEMA,
    productType: DEFAULT_PRODUCT_TYPE_KEY,
    brand: "",
    brandId: null,
    material: "",
    grade: "",
    color: "",
    title: "",
    titleTouched: false,
    powder: "",
    thicknessMil: "",
    texture: "",
    sterility: "",
    aql: "",
    certifications: [],
    sizes: [...DEFAULT_FAMILY_SIZES],
    supplierSkuMirrorsManufacturer: true,
    manufacturerSkuExample: "",
    variants: {},
    samePackagingForAllSizes: true,
    packaging: emptyPackaging(),
    packagingBySize: {},
    cuffStyle: "",
    tensile: "",
    elongation: "",
    punctureNote: "",
    chemicalResistance: "",
    supplierId: null,
    costSourceType: "supplier_quote",
    costSourceReference: "",
    sameCostForAllSizes: true,
    quotedCaseCost: null,
    landedCaseCost: null,
    landedCostConfirmed: false,
    costBySize: {},
    imageUrl: "",
  };
}

export function isFamilySizeSlug(value: string): value is FamilySizeSlug {
  return (SIZE_VALUES as readonly string[]).includes(value);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parsePackaging(raw: unknown): FamilyPackaging {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyPackaging();
  const o = raw as Record<string, unknown>;
  const pack: FamilyPackaging = {
    unitsPerInner: numOrNull(o.unitsPerInner),
    innersPerCase: numOrNull(o.innersPerCase),
  };
  if (o.casesPerPallet != null && o.casesPerPallet !== "") {
    pack.casesPerPallet = numOrNull(o.casesPerPallet);
  }
  return pack;
}

function parseVariant(size: FamilySizeSlug, raw: unknown): FamilyVariantRow {
  const base = emptyVariantRow(size);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  return {
    size,
    manufacturerSku: str(o.manufacturerSku),
    supplierSku: str(o.supplierSku),
    gtin: str(o.gtin),
    manufacturerConfirmed: o.manufacturerConfirmed === true,
    suggestedManufacturerSku: str(o.suggestedManufacturerSku) || null,
  };
}

/** Parse a stored draft. Rejects unknown schemas rather than coercing live catalog rows. */
export function parseFamilyDraft(raw: unknown): NewProductFamilyDraft | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== NEW_PRODUCT_FAMILY_SCHEMA) return null;
  const empty = createEmptyFamilyDraft();
  const sizesRaw = Array.isArray(o.sizes) ? o.sizes : empty.sizes;
  const sizes = sizesRaw.filter((s): s is FamilySizeSlug => typeof s === "string" && isFamilySizeSlug(s));
  const uniqueSizes = sortFamilySizes(sizes);
  const variantsIn = o.variants && typeof o.variants === "object" && !Array.isArray(o.variants)
    ? (o.variants as Record<string, unknown>)
    : {};
  const variants: Record<string, FamilyVariantRow> = {};
  for (const size of uniqueSizes) {
    variants[size] = parseVariant(size, variantsIn[size]);
  }
  const certs = Array.isArray(o.certifications)
    ? o.certifications.filter((c): c is string => typeof c === "string" && c.trim() !== "")
    : [];
  const packagingBySizeIn =
    o.packagingBySize && typeof o.packagingBySize === "object" && !Array.isArray(o.packagingBySize)
      ? (o.packagingBySize as Record<string, unknown>)
      : {};
  const packagingBySize: Record<string, FamilyPackaging> = {};
  for (const size of uniqueSizes) {
    if (packagingBySizeIn[size] != null) packagingBySize[size] = parsePackaging(packagingBySizeIn[size]);
  }
  const costBySizeIn =
    o.costBySize && typeof o.costBySize === "object" && !Array.isArray(o.costBySize)
      ? (o.costBySize as Record<string, unknown>)
      : {};
  const costBySize: Record<string, { quotedCaseCost: number | null; landedCaseCost: number | null }> = {};
  for (const size of uniqueSizes) {
    const rawCost = costBySizeIn[size];
    if (!rawCost || typeof rawCost !== "object" || Array.isArray(rawCost)) continue;
    const c = rawCost as Record<string, unknown>;
    costBySize[size] = {
      quotedCaseCost: numOrNull(c.quotedCaseCost),
      landedCaseCost: numOrNull(c.landedCaseCost),
    };
  }
  const productType = o.productType === "reusable_work_gloves" ? "reusable_work_gloves" : DEFAULT_PRODUCT_TYPE_KEY;
  return {
    schemaVersion: NEW_PRODUCT_FAMILY_SCHEMA,
    productType,
    brand: str(o.brand).trim(),
    brandId: str(o.brandId) || null,
    material: str(o.material),
    grade: str(o.grade),
    color: str(o.color),
    title: str(o.title),
    titleTouched: o.titleTouched === true,
    powder: str(o.powder),
    thicknessMil: str(o.thicknessMil),
    texture: str(o.texture),
    sterility: str(o.sterility),
    aql: str(o.aql),
    certifications: certs,
    sizes: uniqueSizes,
    supplierSkuMirrorsManufacturer: o.supplierSkuMirrorsManufacturer !== false,
    manufacturerSkuExample: str(o.manufacturerSkuExample),
    variants,
    samePackagingForAllSizes: o.samePackagingForAllSizes !== false,
    packaging: parsePackaging(o.packaging),
    packagingBySize,
    cuffStyle: str(o.cuffStyle),
    tensile: str(o.tensile),
    elongation: str(o.elongation),
    punctureNote: str(o.punctureNote),
    chemicalResistance: str(o.chemicalResistance),
    supplierId: str(o.supplierId) || null,
    costSourceType: str(o.costSourceType) || "supplier_quote",
    costSourceReference: str(o.costSourceReference),
    sameCostForAllSizes: o.sameCostForAllSizes !== false,
    quotedCaseCost: numOrNull(o.quotedCaseCost),
    landedCaseCost: numOrNull(o.landedCaseCost),
    landedCostConfirmed: o.landedCostConfirmed === true,
    costBySize,
    imageUrl: str(o.imageUrl).trim(),
  };
}

export function syncDraftSizes(draft: NewProductFamilyDraft, sizes: FamilySizeSlug[]): NewProductFamilyDraft {
  const unique = sortFamilySizes(sizes);
  const variants: Record<string, FamilyVariantRow> = {};
  for (const size of unique) {
    variants[size] = draft.variants[size] ?? emptyVariantRow(size);
  }
  const packagingBySize: Record<string, FamilyPackaging> = {};
  const costBySize: NewProductFamilyDraft["costBySize"] = {};
  for (const size of unique) {
    if (draft.packagingBySize[size]) packagingBySize[size] = draft.packagingBySize[size]!;
    if (draft.costBySize[size]) costBySize[size] = draft.costBySize[size]!;
  }
  return { ...draft, sizes: unique, variants, packagingBySize, costBySize };
}

export function applyGradeChange(draft: NewProductFamilyDraft, grade: string): NewProductFamilyDraft {
  const medical = isMedicalOrSurgicalGrade(grade);
  const food = isFoodServiceGrade(grade);
  const certifications = draft.certifications.filter((c) => {
    if (!medical && (MEDICAL_CERT_TOGGLES as readonly string[]).includes(c)) return false;
    if (!food && (FOOD_CERT_TOGGLES as readonly string[]).includes(c)) return false;
    return true;
  });
  return {
    ...draft,
    grade,
    aql: medical ? draft.aql : "",
    sterility: medical ? draft.sterility : "",
    certifications,
  };
}

export function applySupplierSkuMirror(draft: NewProductFamilyDraft): NewProductFamilyDraft {
  if (!draft.supplierSkuMirrorsManufacturer) return draft;
  const variants: Record<string, FamilyVariantRow> = {};
  for (const size of draft.sizes) {
    const row = draft.variants[size] ?? emptyVariantRow(size);
    variants[size] = { ...row, supplierSku: row.manufacturerSku };
  }
  return { ...draft, variants };
}

export function familyGroupKey(draft: NewProductFamilyDraft, manufacturerBase: string | null): string {
  const pack =
    draft.samePackagingForAllSizes
      ? `${draft.packaging.unitsPerInner ?? ""}x${draft.packaging.innersPerCase ?? ""}`
      : "per-size";
  return [
    (manufacturerBase ?? "").trim().toLowerCase(),
    draft.brand.trim().toLowerCase(),
    draft.material,
    draft.thicknessMil,
    draft.color,
    draft.powder,
    draft.grade,
    pack,
  ].join("|");
}
