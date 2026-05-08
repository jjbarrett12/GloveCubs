/**
 * Phase 5 — governed savings opportunities (no AI, no fuzzy substitutes).
 * Invoked only after trusted price_observations are created (trusted spend memory).
 */

import { appendProcurementEvent } from "@/lib/procurement/opportunity-service";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";
import { isTrustedProcurementLine } from "@/lib/procurement/trusted-procurement-line";
import { isTrustedSupplierMatch } from "@/lib/procurement/trusted-supplier-match";
import { fetchLatestTrustedPriceObservation } from "@/lib/procurement/price-observation-queries";
import { GLOVE_BASIS_PER_100, normalizeGlovePriceBasis } from "@/lib/procurement/glove-uom-normalization";
import { isApprovedSpecGroupMember } from "@/lib/procurement/spec-group-member-governance";

export type SavingsOpportunityBuildResult = { ok: true } | { ok: false; error: string };

async function emitBlocked(supabase: any, opportunityId: string | null, payload: Record<string, unknown>): Promise<boolean> {
  if (!opportunityId) return true;
  return appendProcurementEvent(supabase, opportunityId, ProcurementEventType.savings_opportunity_blocked, payload);
}

async function emitDraftedAndRulesPassed(
  supabase: any,
  opportunityId: string | null,
  opportunityRowId: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  if (!opportunityId) return true;
  const a = await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.savings_opportunity_drafted, {
    savings_opportunity_id: opportunityRowId,
    ...payload,
  });
  if (!a) return false;
  return appendProcurementEvent(supabase, opportunityId, ProcurementEventType.savings_opportunity_rules_passed, {
    savings_opportunity_id: opportunityRowId,
    ...payload,
  });
}

export async function runSavingsOpportunityBuildAfterTrustedObservation(
  supabase: any,
  input: {
    invoiceLineId: string;
    companyId: string;
    catalogProductId: string;
    procurementOpportunityId: string | null;
  }
): Promise<SavingsOpportunityBuildResult> {
  const s = supabase.schema("gc_commerce");
  const { invoiceLineId, companyId, catalogProductId, procurementOpportunityId } = input;

  const { data: line, error: lineErr } = await s
    .from("invoice_lines")
    .select(
      "id, uploaded_invoice_id, review_status, decision_source, human_decided_at, human_decided_by, catalog_product_id, quantity, unit_price"
    )
    .eq("id", invoiceLineId)
    .single();
  if (lineErr || !line) {
    return { ok: false, error: "line_not_found" };
  }
  const L = line as Record<string, unknown>;
  if (!isTrustedProcurementLine(L as Parameters<typeof isTrustedProcurementLine>[0])) {
    await emitBlocked(supabase, procurementOpportunityId, {
      invoice_line_id: invoiceLineId,
      company_id: companyId,
      block_reason: "line_not_trusted",
    });
    return { ok: true };
  }

  const uploadedId = String(L.uploaded_invoice_id);
  const { data: sup, error: supErr } = await s
    .from("invoice_supplier_matches")
    .select("review_status, decision_source, reviewed_at, reviewed_by, catalogos_supplier_id")
    .eq("uploaded_invoice_id", uploadedId)
    .maybeSingle();
  if (supErr) {
    return { ok: false, error: `supplier:${supErr.message}` };
  }
  if (!sup || !isTrustedSupplierMatch(sup as Parameters<typeof isTrustedSupplierMatch>[0])) {
    await emitBlocked(supabase, procurementOpportunityId, {
      invoice_line_id: invoiceLineId,
      company_id: companyId,
      block_reason: "supplier_not_trusted",
    });
    return { ok: true };
  }

  const sourceObs = await fetchLatestTrustedPriceObservation(supabase, companyId, catalogProductId);
  if (!sourceObs) {
    await emitBlocked(supabase, procurementOpportunityId, {
      invoice_line_id: invoiceLineId,
      company_id: companyId,
      catalog_product_id: catalogProductId,
      block_reason: "missing_trusted_source_observation",
    });
    return { ok: true };
  }

  const { data: subs, error: subErr } = await s
    .from("substitution_candidates")
    .select("id, from_catalog_product_id, to_catalog_product_id, spec_group_id, status, approved_at")
    .eq("from_catalog_product_id", catalogProductId)
    .eq("status", "approved")
    .not("approved_at", "is", null);
  if (subErr) {
    return { ok: false, error: `substitution_query:${subErr.message}` };
  }

  for (const sub of subs ?? []) {
    const S = sub as Record<string, unknown>;
    const subId = String(S.id);
    const specGroupId = String(S.spec_group_id);
    const candidateId = String(S.to_catalog_product_id);

    const { data: exist } = await s
      .from("savings_opportunities")
      .select("id")
      .eq("source_invoice_line_id", invoiceLineId)
      .eq("substitution_candidate_id", subId)
      .in("trust_status", ["draft", "operator_reviewed", "approved_for_customer"])
      .maybeSingle();
    if (exist?.id) {
      continue;
    }

    const { data: grp, error: gErr } = await s.from("glove_spec_groups").select("id, status").eq("id", specGroupId).single();
    if (gErr || !grp || String((grp as { status: string }).status) !== "active") {
      await emitBlocked(supabase, procurementOpportunityId, {
        invoice_line_id: invoiceLineId,
        company_id: companyId,
        spec_group_id: specGroupId,
        substitution_candidate_id: subId,
        candidate_catalog_product_id: candidateId,
        block_reason: "spec_group_not_active",
      });
      continue;
    }

    const { data: srcMember, error: smErr } = await s
      .from("glove_spec_group_members")
      .select("id, units_per_line_uom, approved_at, decision_source, valid_to")
      .eq("spec_group_id", specGroupId)
      .eq("catalog_product_id", catalogProductId)
      .maybeSingle();
    if (smErr || !srcMember || !isApprovedSpecGroupMember(srcMember as Record<string, unknown>)) {
      await emitBlocked(supabase, procurementOpportunityId, {
        invoice_line_id: invoiceLineId,
        company_id: companyId,
        spec_group_id: specGroupId,
        substitution_candidate_id: subId,
        candidate_catalog_product_id: candidateId,
        block_reason: "source_not_approved_group_member",
      });
      continue;
    }

    const { data: candMember, error: cmErr } = await s
      .from("glove_spec_group_members")
      .select("id, units_per_line_uom, approved_at, decision_source, valid_to")
      .eq("spec_group_id", specGroupId)
      .eq("catalog_product_id", candidateId)
      .maybeSingle();
    if (cmErr || !candMember || !isApprovedSpecGroupMember(candMember as Record<string, unknown>)) {
      await emitBlocked(supabase, procurementOpportunityId, {
        invoice_line_id: invoiceLineId,
        company_id: companyId,
        spec_group_id: specGroupId,
        substitution_candidate_id: subId,
        candidate_catalog_product_id: candidateId,
        block_reason: "candidate_not_approved_group_member",
      });
      continue;
    }

    const srcUnits = Number((srcMember as { units_per_line_uom: unknown }).units_per_line_uom);
    const candUnits = Number((candMember as { units_per_line_uom: unknown }).units_per_line_uom);
    if (!Number.isFinite(srcUnits) || srcUnits <= 0 || !Number.isFinite(candUnits) || candUnits <= 0) {
      const { error: insBlk } = await s.from("savings_opportunities").insert({
        company_id: companyId,
        source_invoice_line_id: invoiceLineId,
        source_catalog_product_id: catalogProductId,
        candidate_catalog_product_id: candidateId,
        spec_group_id: specGroupId,
        substitution_candidate_id: subId,
        basis_uom: GLOVE_BASIS_PER_100,
        source_unit_price_normalized: null,
        candidate_unit_price_normalized: null,
        estimated_delta_per_basis: null,
        trust_status: "blocked",
        block_reason: "missing_units_per_line_uom",
      });
      if (insBlk) {
        return { ok: false, error: `savings_insert_blocked:${insBlk.message}` };
      }
      await emitBlocked(supabase, procurementOpportunityId, {
        invoice_line_id: invoiceLineId,
        company_id: companyId,
        spec_group_id: specGroupId,
        substitution_candidate_id: subId,
        candidate_catalog_product_id: candidateId,
        block_reason: "missing_units_per_line_uom",
      });
      continue;
    }

    const candObs = await fetchLatestTrustedPriceObservation(supabase, companyId, candidateId);
    if (!candObs) {
      const { error: insBlk } = await s.from("savings_opportunities").insert({
        company_id: companyId,
        source_invoice_line_id: invoiceLineId,
        source_catalog_product_id: catalogProductId,
        candidate_catalog_product_id: candidateId,
        spec_group_id: specGroupId,
        substitution_candidate_id: subId,
        basis_uom: GLOVE_BASIS_PER_100,
        source_unit_price_normalized: null,
        candidate_unit_price_normalized: null,
        estimated_delta_per_basis: null,
        trust_status: "blocked",
        block_reason: "missing_trusted_candidate_observation",
      });
      if (insBlk) {
        return { ok: false, error: `savings_insert_blocked:${insBlk.message}` };
      }
      await emitBlocked(supabase, procurementOpportunityId, {
        invoice_line_id: invoiceLineId,
        company_id: companyId,
        spec_group_id: specGroupId,
        substitution_candidate_id: subId,
        candidate_catalog_product_id: candidateId,
        block_reason: "missing_trusted_candidate_observation",
      });
      continue;
    }

    const srcN = normalizeGlovePriceBasis({
      unitPrice: sourceObs.unit_price,
      unitsPerLineUom: srcUnits,
      basis: GLOVE_BASIS_PER_100,
    });
    const candN = normalizeGlovePriceBasis({
      unitPrice: candObs.unit_price,
      unitsPerLineUom: candUnits,
      basis: GLOVE_BASIS_PER_100,
    });
    if (!srcN.ok || !candN.ok) {
      const { error: insBlk } = await s.from("savings_opportunities").insert({
        company_id: companyId,
        source_invoice_line_id: invoiceLineId,
        source_catalog_product_id: catalogProductId,
        candidate_catalog_product_id: candidateId,
        spec_group_id: specGroupId,
        substitution_candidate_id: subId,
        basis_uom: GLOVE_BASIS_PER_100,
        source_unit_price_normalized: null,
        candidate_unit_price_normalized: null,
        estimated_delta_per_basis: null,
        trust_status: "blocked",
        block_reason: `normalization_failed:${srcN.ok ? "" : srcN.reason}:${candN.ok ? "" : candN.reason}`,
      });
      if (insBlk) {
        return { ok: false, error: `savings_insert_blocked:${insBlk.message}` };
      }
      await emitBlocked(supabase, procurementOpportunityId, {
        invoice_line_id: invoiceLineId,
        company_id: companyId,
        spec_group_id: specGroupId,
        substitution_candidate_id: subId,
        candidate_catalog_product_id: candidateId,
        block_reason: "normalization_failed",
      });
      continue;
    }

    const delta = srcN.normalizedUnitPrice - candN.normalizedUnitPrice;

    const { data: inserted, error: insErr } = await s
      .from("savings_opportunities")
      .insert({
        company_id: companyId,
        source_invoice_line_id: invoiceLineId,
        source_catalog_product_id: catalogProductId,
        candidate_catalog_product_id: candidateId,
        spec_group_id: specGroupId,
        substitution_candidate_id: subId,
        basis_uom: GLOVE_BASIS_PER_100,
        source_unit_price_normalized: srcN.normalizedUnitPrice,
        candidate_unit_price_normalized: candN.normalizedUnitPrice,
        estimated_delta_per_basis: delta,
        trust_status: "draft",
        block_reason: null,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insErr) {
      if (String(insErr.code) === "23505" || String(insErr.message ?? "").toLowerCase().includes("duplicate")) {
        continue;
      }
      return { ok: false, error: `savings_insert:${insErr.message}` };
    }

    const rowId = String((inserted as { id: string }).id);
    const okEv = await emitDraftedAndRulesPassed(supabase, procurementOpportunityId, rowId, {
      company_id: companyId,
      source_invoice_line_id: invoiceLineId,
      source_catalog_product_id: catalogProductId,
      candidate_catalog_product_id: candidateId,
      spec_group_id: specGroupId,
      substitution_candidate_id: subId,
      basis_uom: GLOVE_BASIS_PER_100,
      source_unit_price_normalized: srcN.normalizedUnitPrice,
      candidate_unit_price_normalized: candN.normalizedUnitPrice,
      estimated_delta_per_basis: delta,
    });
    if (!okEv) {
      return { ok: false, error: "savings_opportunity_events_failed" };
    }
  }

  return { ok: true };
}
