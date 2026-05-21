import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { dismissUnifiedStagingVariant } from "@/lib/admin/unified-ingestion-dismiss";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Dismiss unified staging variant. Does not delete evidence or publish.
 */
export async function POST(
  _request: Request,
  { params }: { params: { stagingVariantId: string } }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const stagingVariantId = params.stagingVariantId?.trim();
  if (!stagingVariantId) {
    return NextResponse.json({ error: "stagingVariantId required" }, { status: 400 });
  }

  const result = await dismissUnifiedStagingVariant(stagingVariantId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
