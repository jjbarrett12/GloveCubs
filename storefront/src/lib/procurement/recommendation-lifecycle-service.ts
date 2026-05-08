/**
 * Phase 6 — recommendation lifecycle: all writes for savings_opportunities status transitions
 * and reorder memory promotion/retirement go through this module (no direct PATCH mutations).
 */

import { appendProcurementEvent } from "@/lib/procurement/opportunity-service";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";
import { fetchLatestTrustedPriceObservation } from "@/lib/procurement/price-observation-queries";
import { GLOVE_BASIS_PER_100, normalizeGlovePriceBasis } from "@/lib/procurement/glove-uom-normalization";
import { isApprovedSpecGroupMember } from "@/lib/procurement/spec-group-member-governance";
import { isTrustedProcurementLine } from "@/lib/procurement/trusted-procurement-line";
import { isTrustedSupplierMatch } from "@/lib/procurement/trusted-supplier-match";

export type RecommendationLifecycleResult = { ok: true } | { ok: false; error: string };

export const SAVINGS_ACTIVE_STATUSES = ["draft", "operator_reviewed", "approved_for_customer"] as const;
export const SAVINGS_TERMINAL_STATUSES = ["rejected", "archived"] as const;

const EPS = 1e-4;

function nearEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS;
}

export type StaleRevalidationResult =
  | { ok: true; economic_snapshot: Record<string, unknown> }
  | { ok: false; reason: string };

/**
 * Before approved_for_customer: re-fetch trusted observations, recompute normalized economics,
 * verify line, supplier, active spec group, approved substitution edge, approved members.
 */
export async function revalidateSavingsOpportunityForApproval(
  supabase: any,
  row: Record<string, unknown>
): Promise<StaleRevalidationResult> {
  if (String(row.trust_status) === "blocked") {
    return { ok: false, reason: "blocked_not_approvable" };
  }

  const s = supabase.schema("gc_commerce");
  const companyId = String(row.company_id);
  const lineId = String(row.source_invoice_line_id);
  const srcCatalog = String(row.source_catalog_product_id);
  const candCatalog = String(row.candidate_catalog_product_id);
  const specGroupId = String(row.spec_group_id);
  const subId = row.substitution_candidate_id != null ? String(row.substitution_candidate_id) : "";

  const { data: line, error: le } = await s
    .from("invoice_lines")
    .select(
      "id, uploaded_invoice_id, review_status, decision_source, human_decided_at, human_decided_by, catalog_product_id, quantity, unit_price"
    )
    .eq("id", lineId)
    .single();
  if (le || !line || !isTrustedProcurementLine(line as Parameters<typeof isTrustedProcurementLine>[0])) {
    return { ok: false, reason: "line_not_trusted" };
  }

  const uploadedId = String((line as { uploaded_invoice_id: string }).uploaded_invoice_id);
  const { data: sup, error: se } = await s
    .from("invoice_supplier_matches")
    .select("review_status, decision_source, reviewed_at, reviewed_by, catalogos_supplier_id")
    .eq("uploaded_invoice_id", uploadedId)
    .maybeSingle();
  if (se || !sup || !isTrustedSupplierMatch(sup as Parameters<typeof isTrustedSupplierMatch>[0])) {
    return { ok: false, reason: "supplier_not_trusted" };
  }

  if (!subId) {
    return { ok: false, reason: "missing_substitution_candidate" };
  }

  const { data: sub, error: sube } = await s
    .from("substitution_candidates")
    .select("id, status, approved_at, from_catalog_product_id, to_catalog_product_id, spec_group_id")
    .eq("id", subId)
    .single();
  if (sube || !sub || String((sub as { status: string }).status) !== "approved" || (sub as { approved_at: unknown }).approved_at == null) {
    return { ok: false, reason: "substitution_not_approved" };
  }
  if (String((sub as { from_catalog_product_id: string }).from_catalog_product_id) !== srcCatalog) {
    return { ok: false, reason: "substitution_source_mismatch" };
  }
  if (String((sub as { to_catalog_product_id: string }).to_catalog_product_id) !== candCatalog) {
    return { ok: false, reason: "substitution_candidate_mismatch" };
  }
  if (String((sub as { spec_group_id: string }).spec_group_id) !== specGroupId) {
    return { ok: false, reason: "substitution_spec_group_mismatch" };
  }

  const { data: grp, error: ge } = await s.from("glove_spec_groups").select("id, status").eq("id", specGroupId).single();
  if (ge || !grp || String((grp as { status: string }).status) !== "active") {
    return { ok: false, reason: "spec_group_not_active" };
  }

  const { data: srcMember, error: sme } = await s
    .from("glove_spec_group_members")
    .select("units_per_line_uom, approved_at, decision_source, valid_to")
    .eq("spec_group_id", specGroupId)
    .eq("catalog_product_id", srcCatalog)
    .maybeSingle();
  if (sme || !srcMember || !isApprovedSpecGroupMember(srcMember as Record<string, unknown>)) {
    return { ok: false, reason: "source_member_not_governed" };
  }

  const { data: candMember, error: cme } = await s
    .from("glove_spec_group_members")
    .select("units_per_line_uom, approved_at, decision_source, valid_to")
    .eq("spec_group_id", specGroupId)
    .eq("catalog_product_id", candCatalog)
    .maybeSingle();
  if (cme || !candMember || !isApprovedSpecGroupMember(candMember as Record<string, unknown>)) {
    return { ok: false, reason: "candidate_member_not_governed" };
  }

  const srcUnits = Number((srcMember as { units_per_line_uom: unknown }).units_per_line_uom);
  const candUnits = Number((candMember as { units_per_line_uom: unknown }).units_per_line_uom);
  if (!Number.isFinite(srcUnits) || srcUnits <= 0 || !Number.isFinite(candUnits) || candUnits <= 0) {
    return { ok: false, reason: "missing_units_per_line_uom" };
  }

  const srcObs = await fetchLatestTrustedPriceObservation(supabase, companyId, srcCatalog);
  const candObs = await fetchLatestTrustedPriceObservation(supabase, companyId, candCatalog);
  if (!srcObs || !candObs) {
    return { ok: false, reason: "missing_trusted_observations" };
  }

  const srcN = normalizeGlovePriceBasis({
    unitPrice: srcObs.unit_price,
    unitsPerLineUom: srcUnits,
    basis: GLOVE_BASIS_PER_100,
  });
  const candN = normalizeGlovePriceBasis({
    unitPrice: candObs.unit_price,
    unitsPerLineUom: candUnits,
    basis: GLOVE_BASIS_PER_100,
  });
  if (!srcN.ok || !candN.ok) {
    return { ok: false, reason: "normalization_failed" };
  }

  const storedSrc = Number(row.source_unit_price_normalized);
  const storedCand = Number(row.candidate_unit_price_normalized);
  const storedDelta = Number(row.estimated_delta_per_basis);
  if (!nearEqual(storedSrc, srcN.normalizedUnitPrice) || !nearEqual(storedCand, candN.normalizedUnitPrice)) {
    return { ok: false, reason: "economic_snapshot_stale" };
  }
  const recomputedDelta = srcN.normalizedUnitPrice - candN.normalizedUnitPrice;
  if (!nearEqual(storedDelta, recomputedDelta)) {
    return { ok: false, reason: "delta_stale" };
  }

  return {
    ok: true,
    economic_snapshot: {
      basis_uom: GLOVE_BASIS_PER_100,
      source_unit_price_normalized: srcN.normalizedUnitPrice,
      candidate_unit_price_normalized: candN.normalizedUnitPrice,
      estimated_delta_per_basis: recomputedDelta,
      observed_at_source: srcObs.observed_at,
      observed_at_candidate: candObs.observed_at,
    },
  };
}

function requireOppId(id: string): RecommendationLifecycleResult | null {
  if (!id?.trim()) return { ok: false, error: "procurement_opportunity_id_required" };
  return null;
}

export async function markRecommendationReviewed(
  supabase: any,
  input: {
    savingsOpportunityId: string;
    procurementOpportunityId: string;
    actorId: string;
  }
): Promise<RecommendationLifecycleResult> {
  const bad = requireOppId(input.procurementOpportunityId);
  if (bad) return bad;
  const s = supabase.schema("gc_commerce");
  const now = new Date().toISOString();
  const { data: row, error: re } = await s.from("savings_opportunities").select("*").eq("id", input.savingsOpportunityId).single();
  if (re || !row) return { ok: false, error: "not_found" };
  const status = String((row as { trust_status: string }).trust_status);
  if (status === "blocked") return { ok: false, error: "blocked_not_reviewable" };
  if (status !== "draft") return { ok: false, error: "invalid_transition" };

  const { error: ue } = await s
    .from("savings_opportunities")
    .update({
      trust_status: "operator_reviewed",
      reviewed_at: now,
      reviewed_by: input.actorId,
      updated_at: now,
    })
    .eq("id", input.savingsOpportunityId)
    .eq("trust_status", "draft");
  if (ue) return { ok: false, error: ue.message };

  const ok = await appendProcurementEvent(supabase, input.procurementOpportunityId, ProcurementEventType.recommendation_reviewed, {
    savings_opportunity_id: input.savingsOpportunityId,
    company_id: (row as { company_id: string }).company_id,
    from_status: "draft",
    to_status: "operator_reviewed",
    actor_id: input.actorId,
    occurred_at: now,
  });
  return ok ? { ok: true } : { ok: false, error: "event_append_failed" };
}

export async function approveRecommendationForCustomer(
  supabase: any,
  input: {
    savingsOpportunityId: string;
    procurementOpportunityId: string;
    actorId: string;
  }
): Promise<RecommendationLifecycleResult> {
  const bad = requireOppId(input.procurementOpportunityId);
  if (bad) return bad;
  const s = supabase.schema("gc_commerce");
  const { data: row, error: re } = await s.from("savings_opportunities").select("*").eq("id", input.savingsOpportunityId).single();
  if (re || !row) return { ok: false, error: "not_found" };
  const status = String((row as { trust_status: string }).trust_status);
  if (status === "blocked" || status === "rejected" || status === "archived") {
    return { ok: false, error: "terminal_or_blocked" };
  }
  if (status !== "operator_reviewed") {
    return { ok: false, error: "must_be_operator_reviewed" };
  }

  const stale = await revalidateSavingsOpportunityForApproval(supabase, row as Record<string, unknown>);
  if (!stale.ok) {
    return { ok: false, error: `stale:${stale.reason}` };
  }

  const now = new Date().toISOString();
  const { error: ue } = await s
    .from("savings_opportunities")
    .update({
      trust_status: "approved_for_customer",
      approved_for_customer_at: now,
      approved_for_customer_by: input.actorId,
      updated_at: now,
    })
    .eq("id", input.savingsOpportunityId)
    .eq("trust_status", "operator_reviewed");
  if (ue) return { ok: false, error: ue.message };

  const ok = await appendProcurementEvent(supabase, input.procurementOpportunityId, ProcurementEventType.recommendation_approved, {
    savings_opportunity_id: input.savingsOpportunityId,
    company_id: (row as { company_id: string }).company_id,
    from_status: "operator_reviewed",
    to_status: "approved_for_customer",
    actor_id: input.actorId,
    occurred_at: now,
    ...stale.economic_snapshot,
  });
  return ok ? { ok: true } : { ok: false, error: "event_append_failed" };
}

export async function rejectRecommendation(
  supabase: any,
  input: {
    savingsOpportunityId: string;
    procurementOpportunityId: string;
    actorId: string;
    reason: string;
  }
): Promise<RecommendationLifecycleResult> {
  const bad = requireOppId(input.procurementOpportunityId);
  if (bad) return bad;
  const s = supabase.schema("gc_commerce");
  const now = new Date().toISOString();
  const { data: row, error: re } = await s.from("savings_opportunities").select("*").eq("id", input.savingsOpportunityId).single();
  if (re || !row) return { ok: false, error: "not_found" };
  const status = String((row as { trust_status: string }).trust_status);
  if (status === "blocked") return { ok: false, error: "blocked_use_inspector" };
  if (status === "rejected" || status === "archived") return { ok: false, error: "already_terminal" };
  if (status !== "draft" && status !== "operator_reviewed") {
    return { ok: false, error: "invalid_transition" };
  }

  const reason = input.reason.trim().slice(0, 2000);
  if (!reason) return { ok: false, error: "reason_required" };

  const { error: ue } = await s
    .from("savings_opportunities")
    .update({
      trust_status: "rejected",
      rejected_at: now,
      rejected_by: input.actorId,
      rejection_reason: reason,
      updated_at: now,
    })
    .eq("id", input.savingsOpportunityId)
    .in("trust_status", ["draft", "operator_reviewed"]);
  if (ue) return { ok: false, error: ue.message };

  const ok = await appendProcurementEvent(supabase, input.procurementOpportunityId, ProcurementEventType.recommendation_rejected, {
    savings_opportunity_id: input.savingsOpportunityId,
    company_id: (row as { company_id: string }).company_id,
    from_status: status,
    to_status: "rejected",
    actor_id: input.actorId,
    occurred_at: now,
    rejection_reason: reason,
  });
  return ok ? { ok: true } : { ok: false, error: "event_append_failed" };
}

export async function archiveRecommendation(
  supabase: any,
  input: {
    savingsOpportunityId: string;
    procurementOpportunityId: string;
    actorId: string;
    reason: string;
  }
): Promise<RecommendationLifecycleResult> {
  const bad = requireOppId(input.procurementOpportunityId);
  if (bad) return bad;
  const s = supabase.schema("gc_commerce");
  const now = new Date().toISOString();
  const { data: row, error: re } = await s.from("savings_opportunities").select("*").eq("id", input.savingsOpportunityId).single();
  if (re || !row) return { ok: false, error: "not_found" };
  const status = String((row as { trust_status: string }).trust_status);
  if (status === "blocked") return { ok: false, error: "blocked_not_archivable" };
  if (status === "rejected" || status === "archived") return { ok: false, error: "already_terminal" };
  if (status !== "draft" && status !== "operator_reviewed" && status !== "approved_for_customer") {
    return { ok: false, error: "invalid_transition" };
  }

  const reason = input.reason.trim().slice(0, 2000);
  if (!reason) return { ok: false, error: "reason_required" };

  const { error: ue } = await s
    .from("savings_opportunities")
    .update({
      trust_status: "archived",
      archived_at: now,
      archived_by: input.actorId,
      archive_reason: reason,
      updated_at: now,
    })
    .eq("id", input.savingsOpportunityId)
    .in("trust_status", ["draft", "operator_reviewed", "approved_for_customer"]);
  if (ue) return { ok: false, error: ue.message };

  const ok = await appendProcurementEvent(supabase, input.procurementOpportunityId, ProcurementEventType.recommendation_archived, {
    savings_opportunity_id: input.savingsOpportunityId,
    company_id: (row as { company_id: string }).company_id,
    from_status: status,
    to_status: "archived",
    actor_id: input.actorId,
    occurred_at: now,
    archive_reason: reason,
  });
  return ok ? { ok: true } : { ok: false, error: "event_append_failed" };
}

export async function promoteReorderProduct(
  supabase: any,
  input: {
    companyId: string;
    savingsOpportunityId: string;
    procurementOpportunityId: string;
    actorId: string;
    notes?: string | null;
  }
): Promise<RecommendationLifecycleResult> {
  const bad = requireOppId(input.procurementOpportunityId);
  if (bad) return bad;
  const s = supabase.schema("gc_commerce");
  const { data: row, error: re } = await s.from("savings_opportunities").select("*").eq("id", input.savingsOpportunityId).single();
  if (re || !row) return { ok: false, error: "not_found" };
  if (String((row as { company_id: string }).company_id) !== input.companyId) {
    return { ok: false, error: "company_mismatch" };
  }
  if (String((row as { trust_status: string }).trust_status) !== "approved_for_customer") {
    return { ok: false, error: "savings_not_approved_for_customer" };
  }

  const catalogProductId = String((row as { source_catalog_product_id: string }).source_catalog_product_id);
  const basis = String((row as { basis_uom: string }).basis_uom);
  const lastBasis = (row as { source_unit_price_normalized: unknown }).source_unit_price_normalized;
  const now = new Date().toISOString();

  const { error: ie } = await s.from("procurement_reorder_memory").insert({
    company_id: input.companyId,
    catalog_product_id: catalogProductId,
    promoted_at: now,
    promoted_by: input.actorId,
    decision_source: "operator",
    basis_uom: basis,
    last_trusted_unit_basis: lastBasis != null ? Number(lastBasis) : null,
    valid_to: null,
    notes: input.notes?.trim().slice(0, 4000) ?? null,
    source_savings_opportunity_id: input.savingsOpportunityId,
    updated_at: now,
  });
  if (ie) {
    if (String(ie.code) === "23505" || String(ie.message ?? "").toLowerCase().includes("duplicate")) {
      return { ok: false, error: "reorder_already_active" };
    }
    return { ok: false, error: ie.message };
  }

  const ok = await appendProcurementEvent(supabase, input.procurementOpportunityId, ProcurementEventType.reorder_product_promoted, {
    company_id: input.companyId,
    catalog_product_id: catalogProductId,
    savings_opportunity_id: input.savingsOpportunityId,
    actor_id: input.actorId,
    occurred_at: now,
    basis_uom: basis,
    last_trusted_unit_basis: lastBasis,
  });
  return ok ? { ok: true } : { ok: false, error: "event_append_failed" };
}

export async function retireReorderProduct(
  supabase: any,
  input: {
    reorderMemoryId: string;
    companyId: string;
    procurementOpportunityId: string;
    actorId: string;
    reason?: string | null;
  }
): Promise<RecommendationLifecycleResult> {
  const bad = requireOppId(input.procurementOpportunityId);
  if (bad) return bad;
  const s = supabase.schema("gc_commerce");
  const now = new Date().toISOString();
  const { data: mem, error: me } = await s
    .from("procurement_reorder_memory")
    .select("id, company_id, valid_to, catalog_product_id")
    .eq("id", input.reorderMemoryId)
    .single();
  if (me || !mem) return { ok: false, error: "not_found" };
  if (String((mem as { company_id: string }).company_id) !== input.companyId) {
    return { ok: false, error: "company_mismatch" };
  }
  if ((mem as { valid_to: unknown }).valid_to != null) {
    return { ok: false, error: "already_retired" };
  }

  const patch: Record<string, unknown> = { valid_to: now, updated_at: now };
  const r = input.reason?.trim();
  if (r) patch.notes = r.slice(0, 4000);

  const { error: ue } = await s.from("procurement_reorder_memory").update(patch).eq("id", input.reorderMemoryId).is("valid_to", null);
  if (ue) return { ok: false, error: ue.message };

  const ok = await appendProcurementEvent(supabase, input.procurementOpportunityId, ProcurementEventType.reorder_product_retired, {
    reorder_memory_id: input.reorderMemoryId,
    company_id: input.companyId,
    catalog_product_id: (mem as { catalog_product_id: string }).catalog_product_id,
    actor_id: input.actorId,
    occurred_at: now,
  });
  return ok ? { ok: true } : { ok: false, error: "event_append_failed" };
}
