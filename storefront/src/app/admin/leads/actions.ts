"use server";

import { revalidatePath } from "next/cache";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import {
  isStorefrontAdminQuoteStatus,
  type StorefrontAdminQuoteStatus,
} from "@/lib/admin/launch-ops-status";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function updateQuoteStatusAction(
  id: string,
  status: StorefrontAdminQuoteStatus,
): Promise<{ ok: boolean; error?: string }> {
  const operator = await getAdminOperator();
  if (!operator) return { ok: false, error: "unauthorized" };
  if (!isStorefrontAdminQuoteStatus(status)) return { ok: false, error: "invalid_status" };

  const supabase = getSupabaseAdmin() as any;
  const now = new Date().toISOString();

  const { data: oldQuote } = await supabase
    .schema("catalogos")
    .from("quote_requests")
    .select("status, first_viewed_at, quoted_at, won_at, lost_at, closed_at")
    .eq("id", id)
    .maybeSingle();

  if (!oldQuote) return { ok: false, error: "not_found" };

  const updates: Record<string, unknown> = { status, updated_at: now };
  if (status === "reviewing" && !oldQuote.first_viewed_at) updates.first_viewed_at = now;
  if (status === "quoted" && !oldQuote.quoted_at) updates.quoted_at = now;
  if (status === "won") {
    if (!oldQuote.won_at) updates.won_at = now;
    if (!oldQuote.closed_at) updates.closed_at = now;
  }
  if (status === "lost") {
    if (!oldQuote.lost_at) updates.lost_at = now;
    if (!oldQuote.closed_at) updates.closed_at = now;
  }

  const { error } = await supabase.schema("catalogos").from("quote_requests").update(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };

  const { error: historyError } = await supabase.schema("catalogos").from("quote_status_history").insert({
    quote_request_id: id,
    from_status: oldQuote.status ?? null,
    to_status: status,
    changed_by: operator.id,
  });
  if (historyError) console.error("quote_status_history insert failed:", historyError.message);

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${id}`);
  return { ok: true };
}
