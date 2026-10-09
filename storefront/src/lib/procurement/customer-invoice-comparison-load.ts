/**
 * Server-only customer comparison loader.
 * Maps persisted engine snapshots through the customer DTO; never returns raw invoice_lines.
 * Does not re-run AI or the matching pipeline (no automatic re-analysis).
 */

import {
  toCustomerInvoiceComparison,
  type CustomerInvoiceComparison,
  type CustomerProductAvailability,
} from "@/lib/procurement/customer-invoice-comparison";
import type { InvoiceLineComparison } from "@/lib/procurement/invoice-line-comparison";

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export function parseInvoiceLineComparisonSnapshot(raw: unknown): InvoiceLineComparison | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.trust_status !== "string") return null;
  if (!("savings" in o) || !("block_reason" in o) || !("price_basis" in o) || !("explain" in o)) return null;
  return o as InvoiceLineComparison;
}

const MISSING_SNAPSHOT: InvoiceLineComparison = {
  trust_status: "insufficient_data",
  savings: null,
  block_reason: "equivalency_not_approved",
  compatibility: null,
  packaging: { status: "uom_review_required" },
  price_basis: { current_per_1000: null, glovecubs_per_1000: null },
  explain: { current: {}, matched_glovecubs: null, match_status: "INSUFFICIENT DATA", match_reasons: [] },
};

async function loadProductAvailability(
  supabase: any,
  catalogProductId: string | null,
  catalogVariantId: string | null,
): Promise<CustomerProductAvailability | null> {
  if (!catalogProductId) return null;
  const { data: product } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, name, slug, status")
    .eq("id", catalogProductId)
    .maybeSingle();
  const p = product as { id: string; name: string | null; slug: string | null; status: string } | null;
  if (!p) return null;
  let variant_is_active = true;
  let size_code: string | null = null;
  if (catalogVariantId) {
    const { data: variant } = await supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("id, size_code, is_active")
      .eq("id", catalogVariantId)
      .maybeSingle();
    const v = variant as { id: string; size_code: string | null; is_active: boolean } | null;
    variant_is_active = Boolean(v?.is_active);
    size_code = v?.size_code != null ? String(v.size_code) : null;
  }
  return {
    catalog_product_id: p.id,
    catalog_variant_id: catalogVariantId,
    slug: p.slug ?? "",
    name: p.name ?? "",
    status: p.status,
    variant_is_active,
    size_code,
  };
}

function catalogIdsFromLine(line: {
  catalog_product_id?: string | null;
  catalog_variant_id?: string | null;
  comparison_snapshot?: unknown;
}): { productId: string | null; variantId: string | null } {
  const snap = parseInvoiceLineComparisonSnapshot(line.comparison_snapshot);
  const gc = snap?.explain?.matched_glovecubs as Record<string, unknown> | null | undefined;
  return {
    productId: str(line.catalog_product_id) ?? str(gc?.catalog_product_id),
    variantId: str(line.catalog_variant_id) ?? str(gc?.catalog_variant_id),
  };
}

/**
 * Customer-safe invoice comparison. Call from a server route/BFF only.
 * Never pass the result of this function through a layer that merges invoice_lines.
 */
export async function loadCustomerInvoiceComparison(
  supabase: any,
  invoiceId: string,
): Promise<CustomerInvoiceComparison | null> {
  const { data: inv, error } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("id, vendor_name, invoice_number, payload")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error || !inv) return null;
  const payload = (inv.payload ?? {}) as Record<string, unknown>;
  const extract = (payload.last_extract ?? null) as Record<string, unknown> | null;
  const vendor =
    str((inv as { vendor_name?: string | null }).vendor_name) ?? str(extract?.vendor_name);
  const invoice_number =
    str((inv as { invoice_number?: string | null }).invoice_number) ?? str(extract?.invoice_number);
  const invoice_date = str(extract?.invoice_date);

  const { data: lines } = await supabase
    .schema("gc_commerce")
    .from("invoice_lines")
    .select("id, raw_description, catalog_product_id, comparison_snapshot")
    .eq("uploaded_invoice_id", invoiceId)
    .order("line_index", { ascending: true });

  const mapped = [];
  for (const row of lines ?? []) {
    const line = row as {
      id: string;
      raw_description: string | null;
      catalog_product_id: string | null;
      catalog_variant_id?: string | null;
      comparison_snapshot: unknown;
    };
    const ids = catalogIdsFromLine(line);
    const product = await loadProductAvailability(supabase, ids.productId, ids.variantId);
    mapped.push({
      line_id: line.id,
      description: line.raw_description ?? "",
      comparison: parseInvoiceLineComparisonSnapshot(line.comparison_snapshot) ?? MISSING_SNAPSHOT,
      product,
    });
  }

  return toCustomerInvoiceComparison({
    vendor,
    invoice_number,
    invoice_date,
    lines: mapped,
  });
}
