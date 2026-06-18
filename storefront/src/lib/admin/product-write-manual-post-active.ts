/**
 * Manual-only post-active side effects for storefront product-write active publish.
 * Does not invoke CatalogOS runPublish.
 */

import type { CommercePackagingV1 } from "@commerce-packaging/types";
import { resolveEffectiveCasePriceFromPackaging } from "@commerce-packaging/pricing";
import { buildSupplierOfferUpsertRow } from "../../../../lib/supplier-offer-normalization";
import { refreshProductAttributesJsonSnapshot } from "@/lib/admin/product-attributes-json-snapshot";
import type { ProductWriteInput } from "@/lib/admin/product-write";

export type ManualPostActiveSideEffectSkipReason =
  | "supplier_id_unconfigured"
  | "case_price_missing"
  | "supplier_sku_missing"
  | "sellable_list_price_missing";

export type ManualPostActiveSideEffectResult =
  | { ok: true; skipped: ManualPostActiveSideEffectSkipReason[]; warnings: string[] }
  | { ok: false; error: string };

export type RunManualPostActiveSideEffectsInput = {
  supabase: unknown;
  productId: string;
  input: ProductWriteInput;
  metadata: Record<string, unknown>;
  internalSku: string;
  productName: string;
};

export function shouldRunManualPostActiveSideEffects(
  metadata: Record<string, unknown>,
  targetStatus: "draft" | "active",
  importStagingId?: string | null
): boolean {
  if (targetStatus !== "active") return false;
  // Initial staging promote insert path — product must be reviewed in editor first.
  if (importStagingId?.trim()) return false;
  return true;
}

/** Operator-configured supplier for manual storefront offers (no fabricated supplier rows). */
export function resolveManualPublishSupplierId(): string | null {
  const raw = process.env.GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID?.trim();
  if (!raw) return null;
  return raw;
}

export function resolveManualSupplierSku(input: ProductWriteInput, internalSku: string): string | null {
  const fromVariant = input.variants.find((v) => v.variantSku.trim())?.variantSku.trim();
  if (fromVariant) return fromVariant;
  const parent = internalSku.trim();
  return parent || null;
}

export function resolveManualCasePricing(commercePackaging: CommercePackagingV1 | null | undefined): {
  casePrice: number | null;
  unitsPerCase: number | null;
} {
  if (!commercePackaging) return { casePrice: null, unitsPerCase: null };
  const casePrice = resolveEffectiveCasePriceFromPackaging(commercePackaging);
  const unitsPerCase =
    commercePackaging.units_per_case != null && Number.isFinite(Number(commercePackaging.units_per_case))
      ? Math.trunc(Number(commercePackaging.units_per_case))
      : null;
  return { casePrice, unitsPerCase };
}

export function buildManualSupplierOfferRow(args: {
  supplierId: string;
  productId: string;
  supplierSku: string;
  casePrice: number;
  unitsPerCase: number | null;
}): Record<string, unknown> {
  return buildSupplierOfferUpsertRow(
    {
      supplier_id: args.supplierId,
      product_id: args.productId,
      supplier_sku: args.supplierSku,
      cost: args.casePrice,
      sell_price: args.casePrice,
      is_active: true,
      units_per_case: args.unitsPerCase,
    },
    {
      currency_code: "USD",
      cost_basis: "per_case",
      cost: args.casePrice,
      units_per_case: args.unitsPerCase,
    }
  );
}

async function upsertManualSellableProduct(
  supabase: any,
  catalogProductId: string,
  row: {
    name: string;
    internalSku: string;
    listPriceMinor: number;
    unitCostMinor: number | null;
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const now = new Date().toISOString();
  const { error: sellErr } = await supabase.schema("gc_commerce").from("sellable_products").upsert(
    {
      sku: row.internalSku,
      display_name: row.name,
      catalog_product_id: catalogProductId,
      currency_code: "USD",
      list_price_minor: row.listPriceMinor,
      bulk_price_minor: null,
      unit_cost_minor: row.unitCostMinor,
      is_active: true,
      updated_at: now,
    },
    { onConflict: "sku" }
  );

  if (sellErr) {
    return { ok: false, message: `gc_commerce.sellable_products upsert: ${sellErr.message}` };
  }

  return { ok: true };
}

export async function runManualPostActiveSideEffects(
  params: RunManualPostActiveSideEffectsInput
): Promise<ManualPostActiveSideEffectResult> {
  const { supabase, productId, input, internalSku, productName } = params;
  const skipped: ManualPostActiveSideEffectSkipReason[] = [];
  const warnings: string[] = [];

  const snapshot = await refreshProductAttributesJsonSnapshot(supabase, productId);
  if (!snapshot.ok) {
    return { ok: false, error: `Active publish blocked: ${snapshot.message}` };
  }

  const supplierId = resolveManualPublishSupplierId();
  const supplierSku = resolveManualSupplierSku(input, internalSku);
  const { casePrice, unitsPerCase } = resolveManualCasePricing(input.commercePackaging);

  if (!supplierId) {
    skipped.push("supplier_id_unconfigured");
  } else if (casePrice == null || !Number.isFinite(casePrice) || casePrice <= 0) {
    skipped.push("case_price_missing");
  } else if (!supplierSku) {
    skipped.push("supplier_sku_missing");
  } else {
    const offerRow = buildManualSupplierOfferRow({
      supplierId,
      productId,
      supplierSku,
      casePrice,
      unitsPerCase,
    });
    const { error: offerErr } = await (supabase as any)
      .schema("catalogos")
      .from("supplier_offers")
      .upsert(offerRow, { onConflict: "supplier_id,product_id,supplier_sku" });
    if (offerErr) {
      warnings.push(`supplier_offers upsert: ${offerErr.message}`);
    }
  }

  const listPriceMinor =
    casePrice != null && Number.isFinite(casePrice) && casePrice > 0 ? Math.round(casePrice * 100) : null;
  if (listPriceMinor == null) {
    skipped.push("sellable_list_price_missing");
  } else {
    const sellable = await upsertManualSellableProduct(supabase, productId, {
      name: productName.trim() || "Product",
      internalSku: internalSku.trim(),
      listPriceMinor,
      unitCostMinor: listPriceMinor,
    });
    if (!sellable.ok) {
      warnings.push(sellable.message);
    }
  }

  return { ok: true, skipped, warnings };
}
