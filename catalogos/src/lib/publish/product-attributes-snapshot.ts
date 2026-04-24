/**
 * Mirror facet attributes into catalog_v2.catalog_products.metadata.facet_attributes
 * from catalogos.product_attributes (product_id = catalog_v2 parent id).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMultiSelectAttribute } from "@/lib/catalogos/attribute-validation";
import { logPublishFailure } from "@/lib/observability";

const SNAPSHOT_UPDATE_RETRY_DELAY_MS = 100;

type ProductAttributeRow = {
  attribute_definition_id?: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  attribute_definitions:
    | { attribute_key: string }
    | { attribute_key: string }[]
    | null;
};

function embedAttributeKey(embed: ProductAttributeRow["attribute_definitions"]): string | null {
  if (!embed) return null;
  if (Array.isArray(embed)) {
    const k = embed[0]?.attribute_key;
    return typeof k === "string" ? k : null;
  }
  const k = embed.attribute_key;
  return typeof k === "string" ? k : null;
}

function cellToScalar(row: Pick<ProductAttributeRow, "value_text" | "value_number" | "value_boolean">): string | number | boolean | null {
  if (row.value_text != null && String(row.value_text).trim() !== "") return String(row.value_text).trim();
  if (row.value_number != null && Number.isFinite(Number(row.value_number))) return Number(row.value_number);
  if (row.value_boolean !== null && row.value_boolean !== undefined) return row.value_boolean;
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type RefreshProductAttributesJsonSnapshotResult = { ok: true } | { ok: false; message: string };

/**
 * Rebuild facet_attributes JSON on catalog_v2.catalog_products.metadata.
 */
export async function refreshProductAttributesJsonSnapshot(
  catalogos: SupabaseClient,
  productId: string
): Promise<RefreshProductAttributesJsonSnapshotResult> {
  const { data: rows, error: selErr } = await catalogos
    .from("product_attributes")
    .select("attribute_definition_id, value_text, value_number, value_boolean, attribute_definitions(attribute_key)")
    .eq("product_id", productId)
    .order("attribute_definition_id", { ascending: true })
    .order("value_text", { ascending: true, nullsFirst: true });

  if (selErr) {
    const message = `product_attributes select: ${selErr.message}`;
    logPublishFailure("product_attributes_snapshot_select_failed", { product_id: productId, message });
    return { ok: false, message };
  }

  const list = (rows ?? []) as ProductAttributeRow[];
  const grouped = new Map<string, (string | number | boolean)[]>();

  for (const row of list) {
    const v = cellToScalar(row);
    const attributeKey = embedAttributeKey(row.attribute_definitions);
    if (v !== null && !attributeKey) {
      const message = "product_attributes row has a value but attribute_definitions join returned no attribute_key";
      logPublishFailure("product_attributes_snapshot_orphan_row", { product_id: productId, message });
      return { ok: false, message };
    }
    if (!attributeKey) continue;
    if (v === null) continue;
    const arr = grouped.get(attributeKey) ?? [];
    arr.push(v);
    grouped.set(attributeKey, arr);
  }

  const attributes: Record<string, unknown> = {};
  for (const [key, values] of grouped) {
    if (isMultiSelectAttribute(key)) {
      const strs = values.map((v) => String(v));
      attributes[key] = [...new Set(strs)];
    } else {
      const distinctSerialized = [...new Set(values.map((v) => JSON.stringify(v)))];
      if (distinctSerialized.length > 1) {
        const message = `Conflicting values for single-select attribute_key=${key}: ${distinctSerialized.length} distinct value(s) (rows were ordered by attribute_definition_id, value_text). Data integrity check failed.`;
        logPublishFailure("product_attributes_snapshot_scalar_conflict", {
          product_id: productId,
          attribute_key: key,
          message,
        });
        return { ok: false, message };
      }
      attributes[key] = JSON.parse(distinctSerialized[0]!) as string | number | boolean;
    }
  }

  const { getSupabase } = await import("@/lib/db/client");
  const admin = getSupabase(true);
  const { data: existing, error: exErr } = await admin
    .schema("catalog_v2")
    .from("catalog_products")
    .select("metadata")
    .eq("id", productId)
    .maybeSingle();

  if (exErr) {
    const message = `catalog_v2.catalog_products metadata read: ${exErr.message}`;
    logPublishFailure("product_attributes_snapshot_metadata_read_failed", { product_id: productId, message });
    return { ok: false, message };
  }

  const meta = ((existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
  const merged = { ...meta, facet_attributes: attributes, updated_at: new Date().toISOString() };
  const payload = { metadata: merged, updated_at: new Date().toISOString() };

  let updErr = (await admin.schema("catalog_v2").from("catalog_products").update(payload).eq("id", productId)).error;
  if (updErr) {
    logPublishFailure("product_attributes_snapshot_update_failed_will_retry", {
      product_id: productId,
      message: updErr.message,
    });
    await sleep(SNAPSHOT_UPDATE_RETRY_DELAY_MS);
    updErr = (await admin.schema("catalog_v2").from("catalog_products").update(payload).eq("id", productId)).error;
  }

  if (updErr) {
    const message = `catalog_v2.catalog_products.metadata update (after retry): ${updErr.message}`;
    logPublishFailure("product_attributes_snapshot_update_failed", { product_id: productId, message });
    return { ok: false, message };
  }

  const rowCount = list.length;
  const snapshotKeyCount = Object.keys(attributes).length;
  let multiKeyCount = 0;
  let singleKeyCount = 0;
  for (const key of grouped.keys()) {
    if (isMultiSelectAttribute(key)) multiKeyCount++;
    else singleKeyCount++;
  }

  console.info(
    JSON.stringify({
      event: "product_attributes_snapshot_integrity",
      product_id: productId,
      product_attributes_row_count: rowCount,
      snapshot_key_count: snapshotKeyCount,
      grouped_attribute_key_count: grouped.size,
      multi_select_key_count: multiKeyCount,
      single_select_key_count: singleKeyCount,
    })
  );
  return { ok: true };
}
