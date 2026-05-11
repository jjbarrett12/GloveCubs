/**
 * Admin Product Import API
 *
 * - GET: optional read-only audit (pending / single candidate).
 * - POST: disabled — product ingestion is CatalogOS only (catalog_v2 → sync_canonical_products).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getPendingCandidates, getCandidate, PRODUCT_IMPORT_DEPRECATED } from "@/lib/admin/productImport";

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized - admin access required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    switch (action) {
      case "list": {
        const limit = parseInt(searchParams.get("limit") || "20");
        const offset = parseInt(searchParams.get("offset") || "0");

        const result = await getPendingCandidates(limit, offset);
        return NextResponse.json({
          data: result.candidates,
          total: result.total,
          limit,
          offset,
        });
      }

      case "get": {
        const candidateId = searchParams.get("id");
        if (!candidateId) {
          return NextResponse.json({ error: "Candidate ID required" }, { status: 400 });
        }

        const candidate = await getCandidate(candidateId);
        if (!candidate) {
          return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
        }

        return NextResponse.json({ data: candidate });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Product import GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ error: PRODUCT_IMPORT_DEPRECATED }, { status: 410 });
}
