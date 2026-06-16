export const COMMERCE_PACKAGING_SCHEMA_VERSION = 1 as const;

export type InnerUnitType =
  | "box"
  | "bag"
  | "pack"
  | "dozen"
  | "pair"
  | "each"
  | "roll"
  | "sleeve"
  | "carton";

export type UnitNoun = "gloves" | "pairs" | "units";

export type SellUnit = "case" | "pallet";

export type PackagingSource =
  | "json_ld"
  | "product_spec_table"
  | "product_description"
  | "variant_table"
  | "meta_tags"
  | "page_text_fallback"
  | "url_pattern"
  | "manual_admin_entry";

export type PackagingFieldKey =
  | "inner_unit_type"
  | "units_per_inner"
  | "inners_per_case"
  | "units_per_case"
  | "cases_per_pallet"
  | "units_per_pallet"
  | "case_price"
  | "pallet_price"
  | "pallet_discount_percent"
  | "standard_cost_per_case"
  | "compare_at_case_price"
  | "compare_at_pallet_price";

export type PackagingFieldProvenance = {
  value: unknown;
  confidence: number;
  source: PackagingSource;
  evidence_text?: string;
  inferred?: boolean;
};

export type CommercePackagingV1 = {
  schema_version: typeof COMMERCE_PACKAGING_SCHEMA_VERSION;
  sell_by_case_enabled: true;
  sell_by_pallet_enabled: boolean;
  minimum_sell_unit: "case";
  bulk_sell_unit: "pallet";
  inner_unit_type: InnerUnitType | null;
  units_per_inner: number | null;
  inners_per_case: number | null;
  units_per_case: number | null;
  units_per_case_overridden: boolean;
  unit_noun: UnitNoun;
  case_label: string | null;
  cases_per_pallet: number | null;
  units_per_pallet: number | null;
  units_per_pallet_overridden: boolean;
  pallet_label: string | null;
  /** Internal cost per case (admin only — not shown on storefront). */
  standard_cost_per_case: number | null;
  /** Regular/list case price — shown struck through when sale price is lower. */
  compare_at_case_price: number | null;
  /** Active case price — sale price when lower than compare_at, otherwise the selling price. */
  case_price: number | null;
  /** Regular/list pallet price — shown struck through when pallet sale price is lower. */
  compare_at_pallet_price: number | null;
  /** Active pallet price — sale price when lower than compare_at, otherwise the selling price. */
  pallet_price: number | null;
  pallet_discount_percent: number | null;
  /** @deprecated Prefer compare_at_case_price for list pricing. */
  msrp_per_case: number | null;
  field_provenance: Partial<Record<PackagingFieldKey, PackagingFieldProvenance>>;
  parse_warnings: string[];
};

export type CommercePackagingInput = Partial<Omit<CommercePackagingV1, "schema_version" | "sell_by_case_enabled" | "minimum_sell_unit" | "bulk_sell_unit">> & {
  schema_version?: typeof COMMERCE_PACKAGING_SCHEMA_VERSION;
};
