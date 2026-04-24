/**
 * Publish approved staging (catalogos schema) to master products, supplier offers, and audit.
 * Uses getSupabaseCatalogos() for catalogos.* and getSupabase() only for public.manufacturers when needed.
 * Staging IDs are UUIDs (supplier_products_normalized.id).
 */

import { getSupabaseCatalogos, getSupabase } from "@/lib/db/client";
import { computeSellPrice } from "@/lib/ingestion/pricing-service";
import {
  CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID,
  upsertSellableForCatalogV2Product,
} from "@/lib/publish/ensure-catalog-v2-link";

export interface PublishInput {
  staging_ids: string[];
  published_by?: string;
}

export interface PublishResult {
  published: number;
  errors: string[];
}

function slugFrom(sku: string, name?: string): string {
  const base = (name || sku || "product").trim();
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface NormalizedRow {
  id: string;
  batch_id: string;
  raw_id: string;
  supplier_id: string;
  normalized_data: Record<string, unknown> & {
    sku?: string;
    name?: string;
    cost?: number;
    description?: string;
    image_url?: string;
    brand?: string;
    attributes?: Record<string, unknown>;
  };
  attributes: Record<string, unknown>;
  master_product_id: string | null;
  status: string;
}

/**
 * Publish approved staging rows: ensure master product + supplier offer, write publish_events.
 * Only rows with status = 'approved' are published.
 */
export async function publishStagingCatalogos(input: PublishInput): Promise<PublishResult> {
  const catalogos = getSupabaseCatalogos(true);
  const publicClient = getSupabase(true);
  const errors: string[] = [];
  let published = 0;

  const { data: catRow } = await catalogos
    .from("categories")
    .select("id")
    .eq("slug", "disposable_gloves")
    .single();
  const categoryId = (catRow as { id: string } | null)?.id;
  if (!categoryId) {
    return { published: 0, errors: ["Category disposable_gloves not found"] };
  }

  for (const stagingId of input.staging_ids) {
    const { data: staging, error: stagingErr } = await catalogos
      .from("supplier_products_normalized")
      .select("id, batch_id, raw_id, supplier_id, normalized_data, attributes, master_product_id, status")
      .eq("id", stagingId)
      .single();

    if (stagingErr || !staging) {
      errors.push(`Staging ${stagingId}: ${stagingErr?.message ?? "not found"}`);
      continue;
    }

    if ((staging as NormalizedRow).status !== "approved") {
      errors.push(`Staging ${stagingId}: not approved (status=${(staging as NormalizedRow).status})`);
      continue;
    }

    const row = staging as NormalizedRow;
    const norm = row.normalized_data ?? {};
    const attrs = row.attributes ?? {};
    const cost = Number(norm.cost ?? 0) || 0;
    if (cost < 0) {
      errors.push(`Staging ${stagingId}: invalid cost ${cost}`);
      continue;
    }

    let masterId = row.master_product_id;

    if (!masterId) {
      const sku = String(norm.sku ?? "").trim() || `COS-${row.id.slice(0, 8)}`;
      const name = String(norm.name ?? "Unknown").trim() || sku;
      const admin = publicClient;
      let slug = slugFrom(sku, name);
      const { data: clash } = await admin
        .schema("catalog_v2")
        .from("catalog_products")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (clash) slug = `${slug}-${Date.now().toString(36)}`;

      const { data: newMaster, error: masterErr } = await admin
        .schema("catalog_v2")
        .from("catalog_products")
        .insert({
          product_type_id: CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID,
          slug,
          internal_sku: sku,
          name,
          description: (norm.description as string) ?? null,
          status: "active",
          metadata: { ...attrs, ...norm },
        })
        .select("id")
        .single();

      if (masterErr || !newMaster?.id) {
        errors.push(`Staging ${stagingId}: failed to create catalog_v2 product: ${masterErr?.message}`);
        continue;
      }
      masterId = newMaster.id as string;

      const { error: vErr } = await admin.schema("catalog_v2").from("catalog_variants").insert({
        catalog_product_id: masterId,
        variant_sku: sku,
        sort_order: 0,
        is_active: true,
        metadata: {},
      });
      if (vErr) {
        errors.push(`Staging ${stagingId}: catalog_variants: ${vErr.message}`);
        continue;
      }

      await catalogos
        .from("supplier_products_normalized")
        .update({
          master_product_id: masterId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", stagingId);
    }

    const supplierSku = String(norm.sku ?? row.id).trim();
    const { error: offerErr } = await catalogos.from("supplier_offers").upsert(
      {
        supplier_id: row.supplier_id,
        product_id: masterId,
        supplier_sku: supplierSku,
        cost,
        raw_id: row.raw_id,
        normalized_id: row.id,
        is_active: true,
      },
      { onConflict: "supplier_id,product_id,supplier_sku" }
    );

    if (offerErr) {
      errors.push(`Staging ${stagingId}: offer upsert: ${offerErr.message}`);
      continue;
    }

    await computeSellPrice({
      cost,
      categoryId,
      supplierId: row.supplier_id,
      productId: masterId,
    });

    const brand = String(norm.brand ?? attrs.brand ?? "").trim();
    let manufacturerId: number | null = null;
    if (brand) {
      const { data: existing } = await publicClient
        .from("manufacturers")
        .select("id")
        .eq("name", brand)
        .maybeSingle();
      const existingRow = existing as { id?: number } | null;
      if (existingRow?.id != null) manufacturerId = existingRow.id;
      else {
        const { data: inserted } = await publicClient
          .from("manufacturers")
          .insert({ name: brand } as never)
          .select("id")
          .single();
        const ins = inserted as { id?: number } | null;
        if (ins?.id != null) manufacturerId = ins.id;
      }
    }

    if (manufacturerId != null) {
      const { error: mfrLinkErr } = await publicClient
        .schema("catalog_v2")
        .from("catalog_products")
        .update({ manufacturer_id: manufacturerId, updated_at: new Date().toISOString() })
        .eq("id", masterId);
      if (mfrLinkErr) {
        errors.push(`Staging ${stagingId}: manufacturer link on catalog_v2: ${mfrLinkErr.message}`);
        continue;
      }
    }

    const displayName = String(norm.name ?? "Unknown").trim() || String(norm.sku ?? row.id).trim();
    const skuForSellable = String(norm.sku ?? "").trim() || `COS-${row.id.slice(0, 8)}`;
    const { data: v2n } = await publicClient
      .schema("catalog_v2")
      .from("catalog_products")
      .select("name, internal_sku")
      .eq("id", masterId)
      .single();
    const sellable = await upsertSellableForCatalogV2Product(masterId, {
      name: (v2n as { name?: string })?.name ?? displayName,
      internalSku: ((v2n as { internal_sku?: string | null })?.internal_sku ?? skuForSellable).trim(),
      listPriceMinor: Number.isFinite(cost) ? Math.round(cost * 100) : null,
      isActive: true,
    });
    if (!sellable.ok) {
      errors.push(`Staging ${stagingId}: ${sellable.message}`);
      continue;
    }

    await catalogos.from("publish_events").insert({
      normalized_id: row.id,
      product_id: masterId,
      published_by: input.published_by ?? null,
    });

    published++;
  }

  return { published, errors };
}
