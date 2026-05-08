/**
 * Admin-only conservative CatalogOS rematch (Phase 3).
 * POST /admin/api/uploaded-invoices/[id]/rerun-matching
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { runInvoiceMatchingRerun } from "@/lib/invoice/invoice-matching-rerun";

export async function POST(_request: Request, context: { params: { id: string } }) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uploadedInvoiceId = context.params.id;
  if (!uploadedInvoiceId) {
    return NextResponse.json({ error: "Missing invoice id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;
  const result = await runInvoiceMatchingRerun({
    supabase,
    uploadedInvoiceId,
    adminUserId: admin.id,
  });

  if (!result.ok) {
    const status = result.error === "matching_rerun_in_progress_or_not_found" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    uploaded_invoice_id: uploadedInvoiceId,
    matching_attempt: result.matching_attempt,
    rematched_line_ids: result.rematched_line_ids,
    skipped_trusted_line_ids: result.skipped_trusted_line_ids,
  });
}
