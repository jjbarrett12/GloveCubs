/**
 * PATCH /api/admin/distributor-staging/[id] — Admin-only. Approve or reject a staged product.
 * Body: { status: "approved" | "rejected" }
 */

import { NextResponse } from "next/server";
import { updateDistributorStagingStatus } from "@/lib/distributor-sync/admin-data";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const status = body.status === "approved" ? "approved" : body.status === "rejected" ? "rejected" : null;
    if (!status) {
      return NextResponse.json(
        { error: "status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }
    await updateDistributorStagingStatus(id, status);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 500 }
    );
  }
}
