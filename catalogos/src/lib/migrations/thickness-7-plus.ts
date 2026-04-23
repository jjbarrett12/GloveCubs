/**
 * Migration: replace legacy thickness_mil "7_plus" with canonical numeric values.
 * - Scans supplier_products_normalized and product_attributes for thickness_mil = "7_plus"
 * - Where raw/source text contains a numeric thickness, replaces with that number (as string)
 * - Where no numeric can be recovered, adds review flag (normalized) or logs unresolved (product_attributes)
 * - Preserves auditability via returned audit report
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { parseThicknessFromRaw, combinedText } from "@/lib/normalization/normalization-utils";

export const LEGACY_7_PLUS = "7_plus";
const CANONICAL_THICKNESS_MIN = 2;
const CANONICAL_THICKNESS_MAX = 20;

/** Canonical thickness range (inclusive). */
export const CANONICAL_THICKNESS_RANGE = { min: CANONICAL_THICKNESS_MIN, max: CANONICAL_THICKNESS_MAX } as const;

export interface ThicknessMigrationAuditEntry {
  source: "supplier_products_normalized" | "product_attributes";
  source_id: string;
  raw_id?: string;
  product_id?: string;
  previous_value: string;
  resolved_value: string | null;
  unresolved: boolean;
  created_at: string;
}

export interface ThicknessMigrationResult {
  normalized_updated: number;
  normalized_unresolved: number;
  product_attributes_updated: number;
  product_attributes_unresolved: number;
  audit: ThicknessMigrationAuditEntry[];
  errors: string[];
}

function textFromRawPayload(payload: Record<string, unknown>): string {
  return combinedText(payload);
}

/** Returns true if n is an integer in [2, 20] (canonical thickness_mil range). */
export function isCanonicalThickness(n: number): boolean {
  return Number.isInteger(n) && n >= CANONICAL_THICKNESS_MIN && n <= CANONICAL_THICKNESS_MAX;
}

/**
 * Derive numeric thickness from raw payload text (for migration).
 * Uses same parseThicknessFromRaw as normalization; returns only if in canonical range.
 */
export function deriveThicknessFromRawPayload(payload: Record<string, unknown>): number | undefined {
  const text = combinedText(payload);
  const n = parseThicknessFromRaw(null, text);
  return n != null && isCanonicalThickness(n) ? n : undefined;
}

/**
 * Run the thickness 7_plus migration. Idempotent for already-migrated rows.
 * Returns audit report; does not throw on partial failures (records in result.errors).
 */
export async function migrateThickness7Plus(options: { dryRun?: boolean } = {}): Promise<ThicknessMigrationResult> {
  const supabase = getSupabaseCatalogos(true);
  const dryRun = options.dryRun ?? false;
  const audit: ThicknessMigrationAuditEntry[] = [];
  const errors: string[] = [];

  let normalized_updated = 0;
  let normalized_unresolved = 0;
  let product_attributes_updated = 0;
  let product_attributes_unresolved = 0;

  const now = new Date().toISOString();

  // -------------------------------------------------------------------------
  // 1) supplier_products_normalized: find rows with thickness_mil = 7_plus
  // -------------------------------------------------------------------------
  const { data: normRows, error: normListErr } = await supabase
    .from("supplier_products_normalized")
    .select("id, raw_id, normalized_data, attributes");
  if (normListErr) {
    errors.push(`supplier_products_normalized list: ${normListErr.message}`);
  } else {
    const with7Plus = (normRows ?? []).filter((r: { normalized_data?: { filter_attributes?: { thickness_mil?: string }; attributes?: { thickness_mil?: string } }; attributes?: { thickness_mil?: string } }) => {
      const nd = r.normalized_data as { filter_attributes?: { thickness_mil?: string }; attributes?: { thickness_mil?: string } } | undefined;
      const attrs = (r.attributes ?? nd?.attributes ?? nd?.filter_attributes) as { thickness_mil?: string } | undefined;
      return nd?.filter_attributes?.thickness_mil === LEGACY_7_PLUS || attrs?.thickness_mil === LEGACY_7_PLUS;
    });

    for (const row of with7Plus as { id: string; raw_id: string; normalized_data: Record<string, unknown>; attributes: Record<string, unknown> }[]) {
      let resolved: number | undefined;
      let rawPayload: Record<string, unknown> = {};

      if (row.raw_id) {
        const { data: rawRow, error: rawErr } = await supabase
          .from("supplier_products_raw")
          .select("raw_payload")
          .eq("id", row.raw_id)
          .maybeSingle();
        if (!rawErr && rawRow?.raw_payload) {
          rawPayload = (rawRow.raw_payload as Record<string, unknown>) ?? {};
          const text = textFromRawPayload(rawPayload);
          resolved = parseThicknessFromRaw(null, text);
        }
      }
      if (resolved == null && row.normalized_data) {
        const name = (row.normalized_data as { canonical_title?: string; name?: string }).canonical_title ?? (row.normalized_data as { name?: string }).name;
        const desc = (row.normalized_data as { long_description?: string; description?: string }).long_description ?? (row.normalized_data as { description?: string }).description;
        resolved = parseThicknessFromRaw(null, [name, desc].filter(Boolean).join(" "));
      }

      const resolvedStr = resolved != null && isCanonicalThickness(resolved) ? String(resolved) : null;

      if (resolvedStr) {
        audit.push({
          source: "supplier_products_normalized",
          source_id: row.id,
          raw_id: row.raw_id,
          previous_value: LEGACY_7_PLUS,
          resolved_value: resolvedStr,
          unresolved: false,
          created_at: now,
        });
        normalized_updated++;
        if (!dryRun) {
          const nd = { ...row.normalized_data } as Record<string, unknown>;
          const fa = (nd.filter_attributes ?? nd.attributes ?? {}) as Record<string, unknown>;
          const attrs = { ...row.attributes } as Record<string, unknown>;
          fa.thickness_mil = resolvedStr;
          nd.filter_attributes = fa;
          nd.attributes = { ...attrs, thickness_mil: resolvedStr };
          const anomaly_flags = (nd.anomaly_flags as { code: string; message: string; severity: string }[]) ?? [];
          const withoutUnresolved = anomaly_flags.filter((f) => f.code !== "unresolved_thickness_7_plus");
          nd.anomaly_flags = withoutUnresolved.length ? withoutUnresolved : undefined;

          const { error: upErr } = await supabase
            .from("supplier_products_normalized")
            .update({ normalized_data: nd, attributes: { ...attrs, thickness_mil: resolvedStr }, updated_at: now })
            .eq("id", row.id);
          if (upErr) errors.push(`normalized ${row.id}: ${upErr.message}`);
        }
      } else {
        audit.push({
          source: "supplier_products_normalized",
          source_id: row.id,
          raw_id: row.raw_id,
          previous_value: LEGACY_7_PLUS,
          resolved_value: null,
          unresolved: true,
          created_at: now,
        });
        normalized_unresolved++;
        if (!dryRun) {
          const nd = { ...row.normalized_data } as Record<string, unknown>;
          const anomaly_flags = (nd.anomaly_flags as { code: string; message: string; severity: string }[]) ?? [];
          if (!anomaly_flags.some((f) => f.code === "unresolved_thickness_7_plus")) {
            anomaly_flags.push({
              code: "unresolved_thickness_7_plus",
              message: "Legacy thickness_mil 7_plus could not be resolved to a numeric thickness from source text.",
              severity: "warning",
            });
            nd.anomaly_flags = anomaly_flags;
            const { error: upErr } = await supabase
              .from("supplier_products_normalized")
              .update({ normalized_data: nd, updated_at: now })
              .eq("id", row.id);
            if (upErr) errors.push(`normalized ${row.id}: ${upErr.message}`);
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2) product_attributes: find thickness_mil = 7_plus
  // -------------------------------------------------------------------------
  const { data: defRows } = await supabase
    .from("attribute_definitions")
    .select("id")
    .eq("attribute_key", "thickness_mil");
  const thicknessDefIds = (defRows ?? []).map((r: { id: string }) => r.id);
  if (thicknessDefIds.length > 0) {
    const { data: paRows, error: paErr } = await supabase
      .from("product_attributes")
      .select("id, product_id, attribute_definition_id, value_text")
      .in("attribute_definition_id", thicknessDefIds)
      .eq("value_text", LEGACY_7_PLUS);
    if (!paErr && paRows?.length) {
      for (const pa of paRows as { id: string; product_id: string; attribute_definition_id: string; value_text: string }[]) {
        const { data: prod } = await supabase
          .from("products")
          .select("id, name, description")
          .eq("id", pa.product_id)
          .maybeSingle();
        const text = prod ? `${(prod as { name?: string }).name ?? ""} ${(prod as { description?: string }).description ?? ""}` : "";
        const resolved = parseThicknessFromRaw(null, text);
        const resolvedStr = resolved != null && isCanonicalThickness(resolved) ? String(resolved) : null;

        if (resolvedStr) {
          audit.push({
            source: "product_attributes",
            source_id: pa.id,
            product_id: pa.product_id,
            previous_value: LEGACY_7_PLUS,
            resolved_value: resolvedStr,
            unresolved: false,
            created_at: now,
          });
          product_attributes_updated++;
          if (!dryRun) {
            const { error: upErr } = await supabase
              .from("product_attributes")
              .update({ value_text: resolvedStr, value_number: null })
              .eq("id", pa.id);
            if (upErr) errors.push(`product_attributes ${pa.id}: ${upErr.message}`);
          }
        } else {
          audit.push({
            source: "product_attributes",
            source_id: pa.id,
            product_id: pa.product_id,
            previous_value: LEGACY_7_PLUS,
            resolved_value: null,
            unresolved: true,
            created_at: now,
          });
          product_attributes_unresolved++;
          // Leave value_text as 7_plus; facets layer will exclude it so it doesn't surface
        }
      }
    }
  }

  return {
    normalized_updated,
    normalized_unresolved,
    product_attributes_updated,
    product_attributes_unresolved,
    audit,
    errors,
  };
}
