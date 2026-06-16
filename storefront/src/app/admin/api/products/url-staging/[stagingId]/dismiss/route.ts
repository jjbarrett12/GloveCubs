import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { removeClipboardStagingImport } from "@/lib/admin/clipboard-url-staging";

export const dynamic = "force-dynamic";

/**
 * Marks a clipboard staging row as dismissed (no draft created). Does not publish.
 */
export async function POST(_request: Request, { params }: { params: { stagingId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stagingId = params.stagingId?.trim();
  if (!stagingId) return NextResponse.json({ error: "stagingId required" }, { status: 400 });

  const res = await removeClipboardStagingImport(stagingId);
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: res.status ?? 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
