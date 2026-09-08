"use server";

import { revalidatePath } from "next/cache";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import {
  isStorefrontAdminProspectStatus,
  type StorefrontAdminProspectStatus,
} from "@/lib/admin/launch-ops-status";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function updateProspectStatusAction(
  id: number,
  status: StorefrontAdminProspectStatus,
): Promise<{ ok: boolean; error?: string }> {
  const operator = await getAdminOperator();
  if (!operator) return { ok: false, error: "unauthorized" };
  if (!isStorefrontAdminProspectStatus(status)) return { ok: false, error: "invalid_status" };

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { status, updated_at: now };
  if (status === "contacted") updates.last_contacted_at = now;

  const supabase = getSupabaseAdmin() as any;
  const { error } = await supabase.from("sales_prospects").update(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/prospects");
  revalidatePath(`/admin/prospects/${id}`);
  return { ok: true };
}
