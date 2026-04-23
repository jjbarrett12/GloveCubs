/**
 * Publish approved staging (catalogos schema) to master products, supplier offers, and audit.
 * Uses getSupabaseCatalogos() for catalogos.* and getSupabase() only for public.manufacturers when needed.
 * Staging IDs are UUIDs (supplier_products_normalized.id).
 */

import { getSupabaseCatalogos, getSupabase } from "@/lib/db/client";
import { computeSellPrice } from "@/lib/ingestion/pricing-service";

export interface PublishInput {
  staging_ids: string[];
  published_by?: string;
}

export interface PublishResult {
  published: number;
  errors: string[];
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
      const sku =
        String(norm.sku ?? "").trim() || `COS-${row.id.slice(0, 8)}`;
      const name = String(norm.name ?? "Unknown").trim() || sku;

      const { data: existing } = await catalogos
        .from("products")
        .select("id")
        .eq("sku", sku)
        .maybeSingle();

      if (existing?.id) {
        masterId = existing.id as string;
      } else {
        const { data: newMaster, error: masterErr } = await catalogos
          .from("products")
          .insert({
            sku,
            name,
            category_id: categoryId,
            brand_id: null,
            description: (norm.description as string) ?? null,
            attributes: { ...attrs, ...norm },
            is_active: true,
          })
          .select("id")
          .single();

        if (masterErr || !newMaster?.id) {
          errors.push(`Staging ${stagingId}: failed to create master: ${masterErr?.message}`);
          continue;
        }
        masterId = newMaster.id as string;
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
      const { error: mfrLinkErr } = await catalogos
        .from("products")
        .update({ manufacturer_id: manufacturerId, updated_at: new Date().toISOString() })
        .eq("id", masterId);
      if (mfrLinkErr) {
        errors.push(`Staging ${stagingId}: manufacturer link on catalogos.products: ${mfrLinkErr.message}`);
        continue;
      }
    }

    await catalogos.from("publish_events").insert({
      normalized_id: row.id,
      product_id: masterId,
      live_product_id: null,
      published_by: input.published_by ?? null,
    });

    published++;
  }

  return { published, errors };
}
