/**
 * POST /api/csv-import/preview/[id]/save-profile — Save session mapping as reusable profile.
 * Body: { profile_name: string }
 */

import { NextResponse } from "next/server";
import { getPreviewSession } from "@/lib/csv-import/preview-session-service";
import { saveProfile, sourceFingerprint } from "@/lib/csv-import";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const profile_name = typeof body.profile_name === "string" ? body.profile_name.trim() : "Imported profile";

    const session = await getPreviewSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const mapping = session.inferred_mapping_json;
    if (!mapping?.mappings?.length) {
      return NextResponse.json(
        { error: "No mapping on session; run infer first" },
        { status: 400 }
      );
    }

    const fingerprint = sourceFingerprint(
      session.headers_json ?? [],
      session.supplier_id
    );
    const profileId = await saveProfile({
      supplierId: session.supplier_id,
      profileName: profile_name,
      fingerprint,
      averageConfidence: mapping.average_confidence,
      fields: mapping.mappings,
    });

    return NextResponse.json({ profileId, profile_name });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Save profile failed" },
      { status: 500 }
    );
  }
}
