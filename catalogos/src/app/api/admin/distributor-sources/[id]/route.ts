/**
 * PATCH /api/admin/distributor-sources/[id] — Admin-only. Update source (e.g. status = paused/archived).
 * Body: { status?: "active" | "paused" | "archived" }
 */

import { NextResponse } from "next/server";
import { updateDistributorSourceStatus } from "@/lib/distributor-sync/admin-data";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const status = body.status;
    if (status !== "active" && status !== "paused" && status !== "archived") {
      return NextResponse.json(
        { error: "status must be 'active', 'paused', or 'archived'" },
        { status: 400 }
      );
    }
    await updateDistributorSourceStatus(id, status);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 500 }
    );
  }
}
