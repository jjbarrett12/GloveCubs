import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware-session";

/**
 * Supabase session refresh + route gates (scoped matcher — not global).
 * Workspace and admin layouts read `x-gc-pathname` for safe post-login redirects.
 *
 * Admin HTML routes (`/admin`, not `/admin/api`) are not blocked here; authorization is
 * `resolveAdminAccess()` / `getAdminUser()` on layouts and route handlers.
 * Account / workspace authorization is enforced in those layouts and pages.
 *
 * Matcher must stay in sync with `lib/middleware/matcher-scope.ts` (MIDDLEWARE_MATCHER /
 * middlewareShouldRun). Next.js rejects non-literal matcher expressions.
 */

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c.name, c.value);
  });
}

function withPathnameHeader(request: NextRequest, base: NextResponse, pathname: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-gc-pathname", pathname);
  const out = NextResponse.next({ request: { headers: requestHeaders } });
  copyCookies(base, out);
  return out;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const sessionResponse = await updateSupabaseSession(request);

  let response = sessionResponse;
  if (pathname.startsWith("/workspace/procurement") || pathname === "/workspace") {
    response = withPathnameHeader(request, sessionResponse, pathname);
  } else if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/api")) {
    response = withPathnameHeader(request, sessionResponse, pathname);
  }

  if (pathname.startsWith("/api/internal")) {
    const secret = process.env.INTERNAL_API_SECRET?.trim();
    if (!secret) {
      return response;
    }
    if (request.headers.get("x-gc-internal-secret") !== secret) {
      const denied = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      copyCookies(response, denied);
      return denied;
    }
    return response;
  }

  return response;
}

export const config = {
  matcher: [
    "/account",
    "/account/:path*",
    "/workspace",
    "/workspace/:path*",
    "/admin",
    "/admin/:path*",
    "/api/account",
    "/api/account/:path*",
    "/api/auth",
    "/api/auth/:path*",
    "/api/customer",
    "/api/customer/:path*",
    "/api/workspace",
    "/api/workspace/:path*",
    "/api/internal",
    "/api/internal/:path*",
  ],
};
