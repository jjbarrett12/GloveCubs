/**
 * Admin Product Import API
 *
 * - GET: optional read-only audit (pending / single candidate).
 * - POST: disabled — product ingestion is CatalogOS only (catalog_v2 → sync_canonical_products).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPendingCandidates, getCandidate, PRODUCT_IMPORT_DEPRECATED } from "@/lib/admin/productImport";

async function getAdminUser(): Promise<{ id: string; email: string } | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, email, is_active")
    .eq("id", session.user.id)
    .eq("is_active", true)
    .single();

  if (!adminUser) return null;

  return { id: adminUser.id, email: adminUser.email };
}

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
