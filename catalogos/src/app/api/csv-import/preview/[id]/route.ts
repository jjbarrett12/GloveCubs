/**
 * GET /api/csv-import/preview/[id] — Get preview session.
 */

import { NextResponse } from "next/server";
import { getPreviewSession } from "@/lib/csv-import/preview-session-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getPreviewSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json(session);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load session" },
      { status: 500 }
    );
  }
}
