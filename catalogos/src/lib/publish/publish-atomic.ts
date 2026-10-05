/**
 * Publish through catalogos.publish_staged_rows_atomic.
 * The database function is one transaction: catalog, offers, sellable rows, and
 * staging status commit together. sell_price is not part of the plan.
 */

import { getCommercePackagingFromNormalized } from "@commerce-packaging/staging-bridge";
import { applyCommercePackagingToMetadata } from "@commerce-packaging/metadata-mirror";
import { isMultiSelectAttribute, normalizeFilterAttributesKeys } from "@/lib/catalogos/attribute-validation";
import { publishSafe, stageSafe } from "@/lib/catalogos/validation-modes";
import type { CategorySlug } from "@/lib/catalogos/attribute-dictionary-types";
import { DEFAULT_PRODUCT_TYPE_KEY } from "@/lib/product-types";
import {
  COST_PROVENANCE_ACTOR,
  mergeOfferProvenance,
  offerProvenanceFromStaging,
} from "@/lib/pricing/landed-cost-provenance";
import { queryPrivate, type PrivateQuery } from "@/lib/db/private-sql";
import {
  buildSupplierOfferUpsertRow,
  costBasisFromSellUnit,
  omitUnapprovedSellPriceFromOfferWrite,
  unitsPerCaseFromStagingNormalizedContent,
} from "../../../../lib/supplier-offer-normalization";
import {
  extractSizeCodeFromFilterAttributes,
  isGloveCategorySlug,
  omitSizeFromProductAttributesFilter,
  validatePurchaseItemNumber,
} from "./catalog-variant-ingest";
import { resolvePublishSkusFromStaging } from "@/lib/sku-intelligence/publish-sku-apply";
import type { PublishInput, PublishResult } from "./types";

const EXCLUDED_ATTRIBUTE_KEYS = new Set(["category", "size"]);

export type PublishWritePlan = Record<string, unknown>;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function assertNoSellPrice(plan: PublishWritePlan): void {
  if ("sell_price" in plan || "sell_price_verified_at" in plan || "override_sell_price" in plan) {
    throw new Error("Publish plan must not carry a customer sell price.");
  }
}

export async function commitPublishPlansWith(
  query: PrivateQuery,
  plans: PublishWritePlan[],
  faultInjection = false
): Promise<{ productIds: string[] }> {
  for (const plan of plans) assertNoSellPrice(plan);
  await query("BEGIN");
  try {
    if (faultInjection) {
      await query("SELECT set_config('glovecubs.publish_fault_injection', 'on', true)");
    }
    const result = await query("SELECT catalogos.publish_staged_rows_atomic($1::jsonb) AS result", [JSON.stringify(plans)]);
    await query("COMMIT");
    const payload = result.rows[0]?.result as { product_ids?: string[] } | string | undefined;
    const parsed = typeof payload === "string" ? (JSON.parse(payload) as { product_ids?: string[] }) : payload;
    return { productIds: parsed?.product_ids ?? [] };
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
}

export async function commitPublishPlans(plans: PublishWritePlan[], faultInjection = false): Promise<{ productIds: string[] }> {
  for (const plan of plans) assertNoSellPrice(plan);
  const sql = faultInjection
    ? "SELECT set_config('glovecubs.publish_fault_injection', 'on', true); SELECT catalogos.publish_staged_rows_atomic($1::jsonb) AS result"
    : "SELECT catalogos.publish_staged_rows_atomic($1::jsonb) AS result";
  const result = await queryPrivate(sql, [JSON.stringify(plans)]);
  const payload = result.rows[0]?.result;
  const parsed =
    typeof payload === "string"
      ? (JSON.parse(payload) as { product_ids?: string[] })
      : (payload as { product_ids?: string[] } | undefined);
  return { productIds: parsed?.product_ids ?? [] };
}

function attributeRows(
  productId: string,
  definitions: Map<string, string>,
  filterAttributes: Record<string, unknown>
): { rows: Record<string, unknown>[]; errors: string[]; definitionIds: string[] } {
  const canonical = normalizeFilterAttributesKeys({ ...filterAttributes });
  const keys = Object.keys(canonical).filter(
    (key) => !EXCLUDED_ATTRIBUTE_KEYS.has(key) && canonical[key] != null && canonical[key] !== ""
  );
  const rows: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const definitionIds: string[] = [];
  for (const key of keys) {
    const definitionId = definitions.get(key);
    if (!definitionId) {
      errors.push(`No attribute_definition for category + ${key}`);
      continue;
    }
    definitionIds.push(definitionId);
    const raw = canonical[key];
    if (isMultiSelectAttribute(key)) {
      const values = Array.isArray(raw)
        ? raw.map((value) => String(value).trim()).filter(Boolean)
        : typeof raw === "string"
          ? raw.split(",").map((value) => value.trim()).filter(Boolean)
          : [];
      for (const value of [...new Set(values)]) {
        rows.push({ attribute_definition_id: definitionId, value_text: value, value_number: null, value_boolean: null });
      }
      continue;
    }
    let value_text: string | null = null;
    let value_number: number | null = null;
    let value_boolean: boolean | null = null;
    if (typeof raw === "number") value_number = raw;
    else if (typeof raw === "boolean") value_boolean = raw;
    else if (typeof raw === "string") value_text = raw.trim() || null;
    else if (Array.isArray(raw) && raw.length > 0) value_text = String(raw[0] ?? "").trim() || null;
    if (value_text == null && value_number == null && value_boolean == null) continue;
    rows.push({ attribute_definition_id: definitionId, value_text, value_number, value_boolean });
  }
  void productId;
  return { rows, errors, definitionIds };
}

export async function buildPublishWritePlan(input: PublishInput): Promise<{ ok: true; plan: PublishWritePlan; warnings: string[] } | { ok: false; error: string }> {
  const warnings: string[] = [];
  if (input.pricingCaseCostUnavailable) {
    return {
      ok: false,
      error:
        "Cannot publish: GloveCubs sells by the case only. Normalized case cost could not be computed (missing or invalid packaging/conversion data). Add case_qty, boxes_per_case, or other conversion data in the feed, or fix pricing basis.",
    };
  }
  if (!input.masterProductId) {
    return { ok: false, error: "Either masterProductId or newProductPayload is required" };
  }

  const categorySlug = (input.categorySlug ?? DEFAULT_PRODUCT_TYPE_KEY) as CategorySlug;
  const stagedAttrs = input.stagedFilterAttributes ?? {};
  const attrs = omitSizeFromProductAttributesFilter(stagedAttrs);
  const publishCheck = publishSafe(categorySlug, attrs);
  if (!publishCheck.publishable) return { ok: false, error: publishCheck.error ?? "Cannot publish" };
  const stageCheck = stageSafe(categorySlug, attrs);
  if (stageCheck.missing_strongly_preferred.length > 0) {
    warnings.push(`Strongly preferred attributes missing (non-blocking): ${stageCheck.missing_strongly_preferred.join(", ")}`);
  }

  let sizeCode: string | null = null;
  if (isGloveCategorySlug(categorySlug)) {
    const skuRes = validatePurchaseItemNumber(input.stagedContent.supplier_sku);
    if (!skuRes.ok) return { ok: false, error: skuRes.error };
    sizeCode = extractSizeCodeFromFilterAttributes(stagedAttrs);
    if (!sizeCode) {
      return { ok: false, error: "Cannot publish glove row: staged filter_attributes must include a normalized size for catalog_variants (size is not written to product_attributes)." };
    }
  }

  const product = await queryPrivate(
    "SELECT id, internal_sku, slug, name, description, brand_id, metadata FROM catalog_v2.catalog_products WHERE id = $1",
    [input.masterProductId]
  );
  const prod = product.rows[0] as
    | { internal_sku: string | null; slug: string | null; name: string; description: string | null; metadata: Record<string, unknown> | null }
    | undefined;
  if (!prod) return { ok: false, error: "Master catalog product not found" };

  const category = await queryPrivate("SELECT id FROM catalogos.categories WHERE slug = $1", [categorySlug]);
  const categoryId = (category.rows[0]?.id as string | undefined) ?? null;
  if (!categoryId) return { ok: false, error: "Product category missing (slug lookup failed)" };

  const resolved = input.stagedNormalizedData
    ? resolvePublishSkusFromStaging({
        normalizedData: input.stagedNormalizedData,
        sizeCode,
        fallbackParentSku: (prod.internal_sku || "").trim() || `sku-${input.masterProductId.slice(0, 8)}`,
        fallbackVariantSku: input.stagedContent.supplier_sku,
        applyProposals: true,
        existingParentSku: prod.internal_sku,
        existingVariantSku: null,
      })
    : null;
  const variantSku = resolved?.variantSku?.trim() || input.stagedContent.supplier_sku;
  if (sizeCode) {
    const skuRes = validatePurchaseItemNumber(variantSku);
    if (!skuRes.ok) return { ok: false, error: skuRes.error };
  }
  const internalSku = resolved?.parentSku?.trim() || (prod.internal_sku || "").trim() || `sku-${input.masterProductId.slice(0, 8)}`;

  const keys = Object.keys(normalizeFilterAttributesKeys({ ...attrs })).filter((key) => !EXCLUDED_ATTRIBUTE_KEYS.has(key));
  const definitions = await queryPrivate(
    "SELECT id, attribute_key FROM catalogos.attribute_definitions WHERE category_id = $1 AND attribute_key = ANY($2::text[])",
    [categoryId, keys]
  );
  const definitionMap = new Map<string, string>();
  for (const row of definitions.rows) {
    definitionMap.set(String(row.attribute_key), String(row.id));
  }
  const plannedAttributes = attributeRows(input.masterProductId, definitionMap, attrs);
  if (plannedAttributes.errors.length > 0) {
    return {
      ok: false,
      error: `Publish blocked: product_attributes sync failed (${plannedAttributes.errors.length} error(s)): ${plannedAttributes.errors.join("; ")}`,
    };
  }
  const sizeDefs = await queryPrivate("SELECT id FROM catalogos.attribute_definitions WHERE attribute_key = 'size'", []);
  const images = await queryPrivate(
    "SELECT metadata FROM catalog_v2.catalog_product_images WHERE catalog_product_id = $1",
    [input.masterProductId]
  );
  const hasRealImage = images.rows.some((row) => {
    const metadata = row.metadata as { image_provenance?: string } | null;
    return metadata?.image_provenance !== "placeholder";
  });
  const imageUrl = input.stagedContent.images?.map((url) => String(url).trim()).find(Boolean) ?? "";
  if (!hasRealImage && !imageUrl) {
    return { ok: false, error: "Publish blocked: active-product guard requires ≥1 non-placeholder image. Add product images in staging or upload before publish." };
  }

  const content = input.stagedNormalizedData ?? {};
  const pricing = content.pricing as { sell_unit?: string } | undefined;
  const offer = omitUnapprovedSellPriceFromOfferWrite(
    buildSupplierOfferUpsertRow(
      mergeOfferProvenance(
        {
          supplier_id: input.supplierId,
          product_id: input.masterProductId,
          supplier_sku: input.stagedContent.supplier_sku,
          cost: input.stagedContent.supplier_cost,
          raw_id: input.rawId,
          normalized_id: input.normalizedId,
          is_active: true,
          units_per_case: input.stagedContent.units_per_case ?? null,
        },
        offerProvenanceFromStaging(input.stagedNormalizedData, input.publishedBy ?? COST_PROVENANCE_ACTOR.catalogos_operator)
      ),
      {
        currency_code: "USD",
        cost_basis: input.stagedContent.offer_cost_basis ?? costBasisFromSellUnit(pricing?.sell_unit ?? "case"),
        cost: input.stagedContent.supplier_cost,
        units_per_case: input.stagedContent.units_per_case,
      }
    )
  );
  assertNoSellPrice(offer);

  const metadataPatch: Record<string, unknown> = { category_id: categoryId };
  const packaging = input.stagedNormalizedData ? getCommercePackagingFromNormalized(input.stagedNormalizedData) : null;
  if (packaging) applyCommercePackagingToMetadata(metadataPatch, packaging);

  const variantMetadata: Record<string, unknown> = {};
  if (sizeCode) variantMetadata.size = sizeCode;
  const manufacturerSku = resolved?.manufacturerSku?.trim();
  if (manufacturerSku) variantMetadata.manufacturer_sku = manufacturerSku;

  const unitCostMinor =
    input.stagedContent.supplier_cost != null && Number.isFinite(Number(input.stagedContent.supplier_cost))
      ? Math.round(Number(input.stagedContent.supplier_cost) * 100)
      : null;

  const plan: PublishWritePlan = {
    product_id: input.masterProductId,
    name: input.stagedContent.canonical_title || prod.name,
    description: input.stagedContent.description ?? prod.description ?? "",
    slug: prod.slug || slugify(input.stagedContent.canonical_title || internalSku),
    internal_sku: internalSku,
    brand_name: input.stagedContent.brand ?? "",
    brand_slug: input.stagedContent.brand ? slugify(input.stagedContent.brand) : "",
    variant_sku: sizeCode ? variantSku : "",
    size_code: sizeCode ?? "",
    variant_metadata: variantMetadata,
    gtin: input.stagedContent.gtin ?? "",
    mpn: input.stagedContent.mpn ?? "",
    image_url: hasRealImage ? "" : imageUrl,
    purge_definition_ids: sizeDefs.rows.map((row) => String(row.id)),
    attribute_rows: plannedAttributes.rows,
    multi_select_keys: [...new Set(plannedAttributes.rows.map(() => ""))].filter(Boolean),
    metadata_patch: metadataPatch,
    supplier_id: input.supplierId,
    supplier_sku: input.stagedContent.supplier_sku,
    cost: input.stagedContent.supplier_cost,
    raw_id: input.rawId,
    normalized_id: input.normalizedId,
    units_per_case: offer.units_per_case ?? null,
    currency_code: offer.currency_code,
    cost_basis: offer.cost_basis,
    pack_qty: offer.pack_qty ?? null,
    normalized_unit_cost_minor: offer.normalized_unit_cost_minor ?? null,
    normalized_unit_uom: offer.normalized_unit_uom ?? "",
    normalization_confidence: offer.normalization_confidence ?? "",
    normalization_notes: offer.normalization_notes ?? [],
    cost_source_type: offer.cost_source_type ?? "",
    cost_source_reference: offer.cost_source_reference ?? "",
    cost_updated_at: offer.cost_updated_at ?? "",
    cost_updated_by: offer.cost_updated_by ?? "",
    sellable_sku: internalSku,
    sellable_name: input.stagedContent.canonical_title || prod.name,
    unit_cost_minor: unitCostMinor,
    published_by: input.publishedBy ?? "",
  };
  const multiKeys = Object.keys(normalizeFilterAttributesKeys({ ...attrs })).filter((key) => isMultiSelectAttribute(key));
  plan.multi_select_keys = multiKeys;
  assertNoSellPrice(plan);
  return { ok: true, plan, warnings };
}

export async function publishAtomically(input: PublishInput): Promise<PublishResult> {
  const built = await buildPublishWritePlan(input);
  if (!built.ok) return { success: false, error: built.error };
  try {
    const committed = await commitPublishPlans([built.plan]);
    return {
      success: true,
      productId: committed.productIds[0] ?? input.masterProductId,
      offerCreated: true,
      publishComplete: true,
      searchPublishStatus: "published_synced",
      warnings: built.warnings.length ? built.warnings : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publish failed";
    return {
      success: false,
      error: `Publish blocked: ${message}`,
      productId: input.masterProductId,
      publishComplete: false,
    };
  }
}

export async function publishFamilyAtomically(inputs: PublishInput[]): Promise<PublishResult & { productId?: string }> {
  const plans: PublishWritePlan[] = [];
  const warnings: string[] = [];
  for (const input of inputs) {
    const built = await buildPublishWritePlan(input);
    if (!built.ok) return { success: false, error: built.error, publishComplete: false };
    plans.push(built.plan);
    warnings.push(...built.warnings);
  }
  try {
    const committed = await commitPublishPlans(plans);
    return {
      success: true,
      productId: committed.productIds[0] ?? inputs[0]?.masterProductId,
      offerCreated: true,
      publishComplete: true,
      searchPublishStatus: "published_synced",
      warnings: warnings.length ? warnings : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publish failed";
    return { success: false, error: `Publish blocked: ${message}`, publishComplete: false };
  }
}
