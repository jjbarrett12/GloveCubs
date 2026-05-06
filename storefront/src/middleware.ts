import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Runs only for `/admin/*` and `/api/internal/*` (see `config.matcher`).
 * Public marketing pages and public APIs are never touched by this file.
 */

function relaxAdminPathGate(): boolean {
  if (process.env.ENFORCE_ADMIN_MIDDLEWARE === "true") return false;
  if (process.env.ADMIN_MIDDLEWARE_RELAXED === "true") return true;
  if (process.env.VERCEL_ENV === "production") return false;
  return true;
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname.startsWith("/api/internal")) {
    const secret = process.env.INTERNAL_API_SECRET?.trim();
    if (!secret) {
      return NextResponse.next();
    }
    if (request.headers.get("x-gc-internal-secret") !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    // Route handlers under /admin/api/* enforce their own auth (e.g. Supabase session).
    if (pathname.startsWith("/admin/api")) {
      return NextResponse.next();
    }

    if (relaxAdminPathGate()) {
      return NextResponse.next();
    }

    const gate = process.env.ADMIN_LEADS_SECRET?.trim();
    if (!gate) {
      return new NextResponse(null, { status: 404 });
    }

    const provided = searchParams.get("secret");
    if (provided !== gate) {
      return new NextResponse(null, { status: 404 });
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/internal/:path*"],
};
