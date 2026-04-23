/**
 * Fine-grained admin audit trail (catalogos.admin_catalog_audit).
 * Complements review_decisions (approve/reject/merge) with edits, publish, unpublish, offer changes.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

export interface AdminCatalogAuditRow {
  id: string;
  normalized_id: string | null;
  product_id: string | null;
  supplier_offer_id: string | null;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  created_at: string;
}

export async function logAdminCatalogAudit(entry: {
  normalizedId?: string | null;
  productId?: string | null;
  supplierOfferId?: string | null;
  action: string;
  actor?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase.from("admin_catalog_audit").insert({
    normalized_id: entry.normalizedId ?? null,
    product_id: entry.productId ?? null,
    supplier_offer_id: entry.supplierOfferId ?? null,
    action: entry.action,
    actor: entry.actor ?? "admin",
    details: entry.details ?? {},
  });
  if (error) {
    console.error("[admin_catalog_audit] insert failed", error.message);
  }
}

export async function listAdminCatalogAuditForNormalized(
  normalizedId: string,
  limit = 40
): Promise<AdminCatalogAuditRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("admin_catalog_audit")
    .select("id, normalized_id, product_id, supplier_offer_id, action, actor, details, created_at")
    .eq("normalized_id", normalizedId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[admin_catalog_audit] list failed", error.message);
    return [];
  }
  return (data ?? []) as AdminCatalogAuditRow[];
}

export async function listAdminCatalogAuditForProduct(
  productId: string,
  limit = 40
): Promise<AdminCatalogAuditRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("admin_catalog_audit")
    .select("id, normalized_id, product_id, supplier_offer_id, action, actor, details, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[admin_catalog_audit] list product failed", error.message);
    return [];
  }
  return (data ?? []) as AdminCatalogAuditRow[];
}
