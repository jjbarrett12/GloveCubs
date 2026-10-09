/**
 * Landed case cost contract + lightweight provenance for catalogos.supplier_offers.cost.
 *
 * cost = operator-supplied or imported LANDED CASE COST (USD).
 * This helper does not compose freight, duty, fees, or markup.
 */

export const LANDED_CASE_COST_LABEL = "Landed case cost (USD)";

export const LANDED_CASE_COST_HINT =
  "Your total cost for one case after inbound freight, duties, brokerage, or other landed-cost additions.";

export const COST_SOURCE_TYPES = [
  "supplier_quote",
  "supplier_invoice",
  "supplier_price_sheet",
  "contract",
  "manual",
  "csv_import",
  "url_import",
  "other",
] as const;

export type CostSourceType = (typeof COST_SOURCE_TYPES)[number];

export const COST_SOURCE_TYPE_LABELS: Record<CostSourceType, string> = {
  supplier_quote: "Supplier quote",
  supplier_invoice: "Supplier invoice",
  supplier_price_sheet: "Supplier price sheet",
  contract: "Contract",
  manual: "Manual entry",
  csv_import: "CSV import",
  url_import: "URL import",
  other: "Other",
};

/** System/source identities when no authenticated user is available. Do not invent a person. */
export const COST_PROVENANCE_ACTOR = {
  catalogos_operator: "admin",
  catalogos_system: "catalogos_system",
  csv_import: "csv_import",
  url_import: "url_import",
} as const;

export type LandedCostProvenance = {
  cost_source_type: CostSourceType;
  cost_source_reference: string | null;
  cost_updated_at: string;
  cost_updated_by: string;
};

export function isCostSourceType(value: unknown): value is CostSourceType {
  return typeof value === "string" && (COST_SOURCE_TYPES as readonly string[]).includes(value);
}

export function parseCostSourceType(value: unknown): CostSourceType | null {
  return isCostSourceType(value) ? value : null;
}

export function normalizeCostSourceReference(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, 240);
}

export function withLandedCostProvenance(
  row: Record<string, unknown>,
  args: {
    sourceType: CostSourceType;
    sourceReference?: string | null;
    updatedBy: string;
    updatedAt?: string;
  }
): Record<string, unknown> {
  const by = args.updatedBy.trim();
  return {
    ...row,
    cost_source_type: args.sourceType,
    cost_source_reference: normalizeCostSourceReference(args.sourceReference),
    cost_updated_at: args.updatedAt ?? new Date().toISOString(),
    cost_updated_by: by || COST_PROVENANCE_ACTOR.catalogos_system,
  };
}

export function stagingLandedCostFields(args: {
  cost: number;
  sourceType: CostSourceType;
  sourceReference?: string | null;
  updatedBy: string;
  updatedAt?: string;
  trusted: boolean;
}): Record<string, unknown> {
  const provenanced = withLandedCostProvenance({}, args);
  return {
    supplier_cost: args.cost,
    normalized_case_cost: args.cost,
    pricing: {
      sell_unit: "case",
      normalized_case_cost: args.cost,
    },
    ...provenanced,
    landed_cost_trusted: args.trusted,
  };
}

/** Copy staging provenance onto a supplier_offers write. Omits keys when source type is missing (do not invent). */
export function offerProvenanceFromStaging(
  nd: Record<string, unknown> | null | undefined,
  fallbackActor: string
): LandedCostProvenance | null {
  if (!nd) return null;
  const sourceType = parseCostSourceType(nd.cost_source_type);
  if (!sourceType) return null;
  const updatedBy =
    typeof nd.cost_updated_by === "string" && nd.cost_updated_by.trim()
      ? nd.cost_updated_by.trim()
      : fallbackActor.trim() || COST_PROVENANCE_ACTOR.catalogos_system;
  const updatedAt =
    typeof nd.cost_updated_at === "string" && nd.cost_updated_at.trim()
      ? nd.cost_updated_at
      : new Date().toISOString();
  return {
    cost_source_type: sourceType,
    cost_source_reference: normalizeCostSourceReference(nd.cost_source_reference),
    cost_updated_at: updatedAt,
    cost_updated_by: updatedBy,
  };
}

export function mergeOfferProvenance(
  row: Record<string, unknown>,
  provenance: LandedCostProvenance | null
): Record<string, unknown> {
  if (!provenance) return row;
  return {
    ...row,
    cost_source_type: provenance.cost_source_type,
    cost_source_reference: provenance.cost_source_reference,
    cost_updated_at: provenance.cost_updated_at,
    cost_updated_by: provenance.cost_updated_by,
  };
}

export function normalizeCsvHeader(header: string): string {
  return header.toLowerCase().replace(/\s+/g, "_").replace(/#/g, "number");
}

const EXPLICIT_LANDED_COST_HEADERS = new Set([
  "landed_case_cost",
  "landed_case_cost_usd",
  "landed_cost",
  "normalized_case_cost",
  "case_cost",
]);

const GENERIC_PRICE_HEADERS = new Set(["price", "list_price", "unit_price", "sell_price", "unit_cost"]);

export function isExplicitLandedCostHeader(header: string): boolean {
  return EXPLICIT_LANDED_COST_HEADERS.has(normalizeCsvHeader(header));
}

export function isGenericPriceHeader(header: string): boolean {
  const h = normalizeCsvHeader(header);
  return GENERIC_PRICE_HEADERS.has(h) || h === "cost";
}

/** Auto-guess only explicit landed-case-cost columns. Never auto-pick generic `price`. */
export function guessCsvLandedCostColumnIndex(headers: string[]): number | "" {
  const lower = headers.map(normalizeCsvHeader);
  for (const needle of ["landed_case_cost", "landed_case_cost_usd", "landed_cost", "normalized_case_cost", "case_cost"]) {
    const i = lower.findIndex((h) => h === needle);
    if (i >= 0) return i;
  }
  return "";
}

export type CsvCostMappingTrust = "trusted_landed" | "needs_review";

export function csvCostMappingTrust(header: string | null | undefined): CsvCostMappingTrust {
  if (header == null || !String(header).trim()) return "needs_review";
  return isExplicitLandedCostHeader(header) ? "trusted_landed" : "needs_review";
}

export function urlImportCostProvenance(sourceUrl?: string | null): LandedCostProvenance & { landed_cost_trusted: false } {
  const now = new Date().toISOString();
  return {
    cost_source_type: "url_import",
    cost_source_reference: normalizeCostSourceReference(sourceUrl),
    cost_updated_at: now,
    cost_updated_by: COST_PROVENANCE_ACTOR.url_import,
    landed_cost_trusted: false,
  };
}

export function stampUrlImportCostProvenance(
  row: Record<string, unknown>,
  sourceUrl?: string | null
): Record<string, unknown> {
  const p = urlImportCostProvenance(sourceUrl ?? (typeof row.source_url === "string" ? row.source_url : null));
  return {
    ...row,
    ...p,
  };
}
