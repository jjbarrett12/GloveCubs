/**
 * Deprecated: Storefront URL product import.
 *
 * URL-based import is unified in CatalogOS (crawl job → preview → selected rows → bridge → batch → review → publish).
 * Authenticated admins receive 410 with the CatalogOS URL; this route performs no ingestion.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function catalogosUrlImportBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim();
  if (!raw) return null;
  return `${raw.replace(/\/$/, "")}/dashboard/url-import`;
}

async function getAdminUser(request: NextRequest): Promise<{ id: string; email: string } | null> {
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

function deprecatedResponse() {
  const catalogos_url_import = catalogosUrlImportBase();
  return NextResponse.json(
    {
      error: "Storefront URL product import is retired. Use CatalogOS URL import.",
      code: "URL_IMPORT_MOVED_TO_CATALOGOS",
      catalogos_url_import,
    },
    { status: 410 }
  );
}

export async function GET(request: NextRequest) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized - admin access required" }, { status: 401 });
  }
  return deprecatedResponse();
}

export async function POST(request: NextRequest) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized - admin access required" }, { status: 401 });
  }
  return deprecatedResponse();
}
