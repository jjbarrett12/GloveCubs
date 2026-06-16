/**
 * Mirror facet attributes into catalog_v2.catalog_products.metadata.facet_attributes
 * from catalogos.product_attributes — storefront manual publish path.
 *
 * @see catalogos/src/lib/publish/product-attributes-snapshot.ts (CatalogOS publish)
 */

import { GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS } from "@/lib/catalog/catalog-facet-registry";

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

function isMultiSelectAttribute(key: string): boolean {
  return (GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS as readonly string[]).includes(key);
}

function embedAttributeKey(embed: ProductAttributeRow["attribute_definitions"]): string | null {
  if (!embed) return null;
  if (Array.isArray(embed)) {
    const k = embed[0]?.attribute_key;
    return typeof k === "string" ? k : null;
  }
  const k = embed.attribute_key;
  return typeof k === "string" ? k : null;
}

function cellToScalar(
  row: Pick<ProductAttributeRow, "value_text" | "value_number" | "value_boolean">
): string | number | boolean | null {
  if (row.value_text != null && String(row.value_text).trim() !== "") return String(row.value_text).trim();
  if (row.value_number != null && Number.isFinite(Number(row.value_number))) return Number(row.value_number);
  if (row.value_boolean !== null && row.value_boolean !== undefined) return row.value_boolean;
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type RefreshProductAttributesJsonSnapshotResult = { ok: true } | { ok: false; message: string };

export async function refreshProductAttributesJsonSnapshot(
  supabase: any,
  productId: string
): Promise<RefreshProductAttributesJsonSnapshotResult> {
  const { data: rows, error: selErr } = await supabase
    .schema("catalogos")
    .from("product_attributes")
    .select("attribute_definition_id, value_text, value_number, value_boolean, attribute_definitions(attribute_key)")
    .eq("product_id", productId)
    .order("attribute_definition_id", { ascending: true })
    .order("value_text", { ascending: true, nullsFirst: true });

  if (selErr) {
    return { ok: false, message: `product_attributes select: ${selErr.message}` };
  }

  const list = (rows ?? []) as ProductAttributeRow[];
  const grouped = new Map<string, (string | number | boolean)[]>();

  for (const row of list) {
    const v = cellToScalar(row);
    const attributeKey = embedAttributeKey(row.attribute_definitions);
    if (v !== null && !attributeKey) {
      return {
        ok: false,
        message:
          "product_attributes row has a value but attribute_definitions join returned no attribute_key",
      };
    }
    if (!attributeKey || v === null) continue;
    const arr = grouped.get(attributeKey) ?? [];
    arr.push(v);
    grouped.set(attributeKey, arr);
  }

  const attributes: Record<string, unknown> = {};
  for (const [key, values] of grouped) {
    if (isMultiSelectAttribute(key)) {
      attributes[key] = [...new Set(values.map((v) => String(v)))];
    } else {
      const distinctSerialized = [...new Set(values.map((v) => JSON.stringify(v)))];
      if (distinctSerialized.length > 1) {
        return {
          ok: false,
          message: `Conflicting values for single-select attribute_key=${key}: ${distinctSerialized.length} distinct value(s).`,
        };
      }
      attributes[key] = JSON.parse(distinctSerialized[0]!) as string | number | boolean;
    }
  }

  const { data: existing, error: exErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("metadata")
    .eq("id", productId)
    .maybeSingle();

  if (exErr) {
    return { ok: false, message: `catalog_v2.catalog_products metadata read: ${exErr.message}` };
  }

  const meta = ((existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<
    string,
    unknown
  >;
  const merged = { ...meta, facet_attributes: attributes, updated_at: new Date().toISOString() };
  const payload = { metadata: merged, updated_at: new Date().toISOString() };

  let updErr = (await supabase.schema("catalog_v2").from("catalog_products").update(payload).eq("id", productId))
    .error;
  if (updErr) {
    await sleep(SNAPSHOT_UPDATE_RETRY_DELAY_MS);
    updErr = (await supabase.schema("catalog_v2").from("catalog_products").update(payload).eq("id", productId))
      .error;
  }

  if (updErr) {
    return { ok: false, message: `catalog_v2.catalog_products.metadata update (after retry): ${updErr.message}` };
  }

  return { ok: true };
}
