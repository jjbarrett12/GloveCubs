import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Runs only for `/admin/*` and `/api/internal/*` (see `config.matcher`).
 * Public marketing pages, `/workspace/*`, and public storefront `src/app/api/*` are never touched here
 * (workspace auth is enforced in `src/app/workspace/procurement/layout.tsx`).
 */

function relaxAdminPathGate(): boolean {
  if (process.env.ENFORCE_ADMIN_MIDDLEWARE === "true") return false;
  if (process.env.ADMIN_MIDDLEWARE_RELAXED === "true") return true;
  if (process.env.VERCEL_ENV === "production") return false;
  return true;
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname.startsWith("/workspace/procurement")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-gc-pathname", pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (pathname === "/api/ai/invoice/extract") {
    console.log(
      JSON.stringify({
        category: "invoice_intake",
        event: "legacy_next_path_rewrite",
        path: pathname,
        method: request.method,
        ts: new Date().toISOString(),
      })
    );
  }

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
  matcher: [
    "/admin/:path*",
    "/api/internal/:path*",
    "/api/ai/invoice/extract",
    "/workspace/procurement",
    "/workspace/procurement/:path*",
  ],
};
