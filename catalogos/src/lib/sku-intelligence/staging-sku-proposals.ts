import {
  deriveSkuProposalsFromInput,
  normalizeGloveSizeCode,
  type GloveSkuProposalInput,
  type GloveSkuProposalVariantInput,
} from "@glove-sku-intelligence";
import {
  CATALOGOS_SKU_PROPOSALS_SCHEMA_VERSION,
  skuProposalsFromResult,
  type CatalogOsSkuProposalsV1,
} from "./types";

export type StagingSkuContextRow = {
  normalized_data?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  inferred_size?: string | null;
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function firstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return "";
}

function variantInputFromStagingRow(row: StagingSkuContextRow): GloveSkuProposalVariantInput | null {
  const nd = row.normalized_data ?? {};
  const attrs = row.attributes ?? (nd.filter_attributes as Record<string, unknown>) ?? {};
  const sizeRaw = firstNonEmpty(row.inferred_size, attrs.size, nd.size);
  const sizeCode = sizeRaw ? normalizeGloveSizeCode(sizeRaw) ?? sizeRaw.toUpperCase() : null;
  const manufacturerSku = firstNonEmpty(
    nd.manufacturer_sku,
    nd.manufacturer_part_number,
    nd.supplier_sku,
    nd.sku,
    attrs.supplier_sku
  );
  if (!sizeCode && !manufacturerSku) return null;
  return {
    size_code: sizeCode,
    size_label: sizeRaw || null,
    manufacturer_sku: manufacturerSku || null,
    source_sku: firstNonEmpty(nd.supplier_sku, nd.sku) || null,
  };
}

/** Build source-neutral SKU input from one or more staging rows (family siblings). */
export function buildGloveSkuInputFromStagingRows(rows: StagingSkuContextRow[]): GloveSkuProposalInput {
  const primary = rows[0] ?? {};
  const nd = primary.normalized_data ?? {};
  const variants: GloveSkuProposalVariantInput[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const v = variantInputFromStagingRow(row);
    if (!v) continue;
    const key = `${v.size_code ?? ""}|${v.manufacturer_sku ?? v.source_sku ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push(v);
  }

  return {
    productName: firstNonEmpty(nd.canonical_title, nd.name, nd.title, nd.product_name),
    brand: firstNonEmpty(nd.brand, (primary.attributes ?? {}).brand),
    sourceSku: firstNonEmpty(nd.supplier_sku, nd.sku, nd.manufacturer_part_number),
    url: firstNonEmpty(nd.source_url, nd.url),
    variants,
  };
}

export function buildCatalogOsSkuProposalsFromStagingRows(
  rows: StagingSkuContextRow[]
): CatalogOsSkuProposalsV1 {
  const result = deriveSkuProposalsFromInput(buildGloveSkuInputFromStagingRows(rows));
  return skuProposalsFromResult(result);
}

export function buildCatalogOsSkuProposalsFromParsedRow(
  row: Record<string, unknown>
): CatalogOsSkuProposalsV1 {
  const variantsRaw = row.variants;
  const variantInputs: GloveSkuProposalVariantInput[] = [];
  if (Array.isArray(variantsRaw)) {
    for (const item of variantsRaw) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      variantInputs.push({
        size_code: str(o.normalized_size_code ?? o.size_code ?? o.size),
        size_label: str(o.size_label ?? o.size),
        manufacturer_sku: str(o.manufacturer_sku ?? o.source_sku ?? o.sku),
        source_sku: str(o.source_sku ?? o.sku),
      });
    }
  }

  const input: GloveSkuProposalInput = {
    productName: firstNonEmpty(row.name, row.title, row.product_name, row.canonical_title),
    brand: str(row.brand) || null,
    sourceSku: firstNonEmpty(row.supplier_sku, row.sku, row.manufacturer_part_number),
    url: firstNonEmpty(row.source_url, row.url),
    variants:
      variantInputs.length > 0
        ? variantInputs
        : [
            {
              size_code: str(row.size) || null,
              size_label: str(row.size) || null,
              manufacturer_sku: firstNonEmpty(row.manufacturer_sku, row.supplier_sku, row.sku),
              source_sku: firstNonEmpty(row.supplier_sku, row.sku),
            },
          ],
  };

  return skuProposalsFromResult(deriveSkuProposalsFromInput(input));
}

export function attachSkuProposalsToNormalizedData(
  normalizedData: Record<string, unknown>,
  rows: StagingSkuContextRow[]
): Record<string, unknown> {
  const proposals = buildCatalogOsSkuProposalsFromStagingRows(rows.length ? rows : [{ normalized_data: normalizedData }]);
  return { ...normalizedData, sku_proposals: proposals };
}

export function applySkuProposalsToNormalizedData(
  normalizedData: Record<string, unknown>,
  options?: { overwrite?: boolean }
): Record<string, unknown> {
  const existing = normalizedData.sku_proposals as CatalogOsSkuProposalsV1 | undefined;
  if (!existing || existing.schema_version !== CATALOGOS_SKU_PROPOSALS_SCHEMA_VERSION) {
    return normalizedData;
  }
  const overwrite = options?.overwrite === true;
  const hasAppliedParent = Boolean(str(existing.applied_parent_sku));
  const appliedVariants = { ...(existing.applied_variant_skus ?? {}) };

  let appliedParent = existing.applied_parent_sku ?? null;
  if (existing.proposed_parent_sku) {
    if (overwrite || !hasAppliedParent) {
      appliedParent = existing.proposed_parent_sku;
    }
  }

  for (const v of existing.variants) {
    const size = v.size_code ? normalizeGloveSizeCode(v.size_code) ?? v.size_code.toUpperCase() : null;
    if (!size || !v.proposed_glovecubs_sku) continue;
    if (overwrite || !appliedVariants[size]) {
      appliedVariants[size] = v.proposed_glovecubs_sku;
    }
  }

  return {
    ...normalizedData,
    sku_proposals: {
      ...existing,
      schema_version: CATALOGOS_SKU_PROPOSALS_SCHEMA_VERSION,
      applied_parent_sku: appliedParent,
      applied_variant_skus: Object.keys(appliedVariants).length ? appliedVariants : null,
      apply_overwrite_confirmed: overwrite ? true : existing.apply_overwrite_confirmed,
    },
  };
}

export { CATALOGOS_SKU_PROPOSALS_SCHEMA_VERSION };
