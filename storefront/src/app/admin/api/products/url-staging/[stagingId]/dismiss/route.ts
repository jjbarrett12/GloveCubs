import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Marks a clipboard staging row as dismissed (no draft created). Does not publish.
 */
export async function POST(_request: Request, { params }: { params: { stagingId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const stagingId = params.stagingId?.trim();
  if (!stagingId) return NextResponse.json({ error: "stagingId required" }, { status: 400 });

  const supabase = getSupabaseAdmin() as any;
  const { data: row, error: selErr } = await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .select("id, review_status")
    .eq("id", stagingId)
    .maybeSingle();

  if (selErr || !row) {
    return NextResponse.json({ error: "Staging row not found." }, { status: 404 });
  }
  const st = row as { review_status: string };
  if (st.review_status !== "needs_review") {
    return NextResponse.json({ error: "Only rows awaiting review can be dismissed." }, { status: 409 });
  }

  const { error: upErr } = await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .update({ review_status: "dismissed" })
    .eq("id", stagingId)
    .eq("review_status", "needs_review");

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
