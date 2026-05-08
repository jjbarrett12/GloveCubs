"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  approveRecommendationForCustomer,
  archiveRecommendation,
  markRecommendationReviewed,
  promoteReorderProduct,
  rejectRecommendation,
  retireReorderProduct,
} from "@/lib/procurement/recommendation-lifecycle-service";

function revalidateCompany(companyId: string) {
  revalidatePath(`/admin/procurement/company/${companyId}`);
  revalidatePath("/admin/procurement");
}

export async function recommendationMarkReviewedAction(_prev: unknown, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "unauthorized" };
  const companyId = String(formData.get("company_id") ?? "");
  const savingsId = String(formData.get("savings_opportunity_id") ?? "");
  const oppId = String(formData.get("procurement_opportunity_id") ?? "");
  if (!companyId || !savingsId || !oppId) return { ok: false, error: "missing_fields" };
  const supabase = getSupabaseAdmin() as any;
  const r = await markRecommendationReviewed(supabase, {
    savingsOpportunityId: savingsId,
    procurementOpportunityId: oppId,
    actorId: admin.id,
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidateCompany(companyId);
  return { ok: true };
}

export async function recommendationApproveAction(_prev: unknown, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "unauthorized" };
  const companyId = String(formData.get("company_id") ?? "");
  const savingsId = String(formData.get("savings_opportunity_id") ?? "");
  const oppId = String(formData.get("procurement_opportunity_id") ?? "");
  if (!companyId || !savingsId || !oppId) return { ok: false, error: "missing_fields" };
  const supabase = getSupabaseAdmin() as any;
  const r = await approveRecommendationForCustomer(supabase, {
    savingsOpportunityId: savingsId,
    procurementOpportunityId: oppId,
    actorId: admin.id,
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidateCompany(companyId);
  return { ok: true };
}

export async function recommendationRejectAction(_prev: unknown, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "unauthorized" };
  const companyId = String(formData.get("company_id") ?? "");
  const savingsId = String(formData.get("savings_opportunity_id") ?? "");
  const oppId = String(formData.get("procurement_opportunity_id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!companyId || !savingsId || !oppId) return { ok: false, error: "missing_fields" };
  const supabase = getSupabaseAdmin() as any;
  const r = await rejectRecommendation(supabase, {
    savingsOpportunityId: savingsId,
    procurementOpportunityId: oppId,
    actorId: admin.id,
    reason,
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidateCompany(companyId);
  return { ok: true };
}

export async function recommendationArchiveAction(_prev: unknown, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "unauthorized" };
  const companyId = String(formData.get("company_id") ?? "");
  const savingsId = String(formData.get("savings_opportunity_id") ?? "");
  const oppId = String(formData.get("procurement_opportunity_id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!companyId || !savingsId || !oppId) return { ok: false, error: "missing_fields" };
  const supabase = getSupabaseAdmin() as any;
  const r = await archiveRecommendation(supabase, {
    savingsOpportunityId: savingsId,
    procurementOpportunityId: oppId,
    actorId: admin.id,
    reason,
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidateCompany(companyId);
  return { ok: true };
}

export async function reorderPromoteAction(_prev: unknown, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "unauthorized" };
  const companyId = String(formData.get("company_id") ?? "");
  const savingsId = String(formData.get("savings_opportunity_id") ?? "");
  const oppId = String(formData.get("procurement_opportunity_id") ?? "");
  if (!companyId || !savingsId || !oppId) return { ok: false, error: "missing_fields" };
  const supabase = getSupabaseAdmin() as any;
  const r = await promoteReorderProduct(supabase, {
    companyId,
    savingsOpportunityId: savingsId,
    procurementOpportunityId: oppId,
    actorId: admin.id,
    notes: String(formData.get("notes") ?? "") || null,
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidateCompany(companyId);
  return { ok: true };
}

export async function reorderRetireAction(_prev: unknown, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "unauthorized" };
  const companyId = String(formData.get("company_id") ?? "");
  const memoryId = String(formData.get("reorder_memory_id") ?? "");
  const oppId = String(formData.get("procurement_opportunity_id") ?? "");
  if (!companyId || !memoryId || !oppId) return { ok: false, error: "missing_fields" };
  const supabase = getSupabaseAdmin() as any;
  const r = await retireReorderProduct(supabase, {
    reorderMemoryId: memoryId,
    companyId,
    procurementOpportunityId: oppId,
    actorId: admin.id,
    reason: String(formData.get("reason") ?? "") || null,
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidateCompany(companyId);
  return { ok: true };
}
