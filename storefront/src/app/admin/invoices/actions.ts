"use server";

import { revalidatePath } from "next/cache";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import {
  isStorefrontAdminInvoiceOpsStatus,
  type StorefrontAdminInvoiceOpsStatus,
} from "@/lib/admin/launch-ops-status";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function updateInvoiceOpsStatusAction(
  id: string,
  staffOpsStatus: StorefrontAdminInvoiceOpsStatus,
): Promise<{ ok: boolean; error?: string }> {
  const operator = await getAdminOperator();
  if (!operator) return { ok: false, error: "unauthorized" };
  if (!isStorefrontAdminInvoiceOpsStatus(staffOpsStatus)) return { ok: false, error: "invalid_status" };

  const supabase = getSupabaseAdmin() as any;
  const now = new Date().toISOString();
  const { error } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .update({ staff_ops_status: staffOpsStatus, updated_at: now })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${id}`);
  return { ok: true };
}
