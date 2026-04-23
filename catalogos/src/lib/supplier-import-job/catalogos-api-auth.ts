/**
 * CatalogOS supplier-import API auth: shared admin secret + organization scoping headers.
 * Aligns with middleware CATALOGOS_ADMIN_SECRET (Bearer or catalogos_admin cookie).
 */

import { NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CatalogosSupplierImportAuthContext {
  organizationId: string;
  /** Actor label for audit (header X-Catalogos-Operator-Id or anonymous). */
  operatorId: string;
  /** True when CATALOGOS_ADMIN_SECRET was configured. */
  secretConfigured: boolean;
}

function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || null;
  }
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/(?:^|;\s*)catalogos_admin=([^;]+)/);
  return m?.[1] ? decodeURIComponent(m[1].trim()) : null;
}

/**
 * - When CATALOGOS_ADMIN_SECRET is set: require matching Bearer or catalogos_admin cookie → else 401.
 * - When unset (local dev): allow request through without token.
 * - Always require X-Catalogos-Organization-Id (valid UUID) for supplier-import job routes → else 403.
 * - Optional X-Catalogos-Operator-Id for audit attribution.
 */
export function requireSupplierImportAuth(
  req: Request
): CatalogosSupplierImportAuthContext | NextResponse {
  const secret = process.env.CATALOGOS_ADMIN_SECRET;
  const secretConfigured = Boolean(secret && secret.length > 0);
  if (process.env.NODE_ENV === "production" && !secretConfigured) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        detail: "CATALOGOS_ADMIN_SECRET must be configured for supplier-import APIs in production",
      },
      { status: 401 }
    );
  }
  if (secretConfigured) {
    const token = tokenFromRequest(req);
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const organizationId = req.headers.get("x-catalogos-organization-id")?.trim() ?? "";
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return NextResponse.json(
      {
        error: "Forbidden",
        detail: "Valid X-Catalogos-Organization-Id header is required",
      },
      { status: 403 }
    );
  }

  const operatorId =
    req.headers.get("x-catalogos-operator-id")?.trim() ||
    req.headers.get("x-catalogos-operator-email")?.trim() ||
    "anonymous";

  return {
    organizationId,
    operatorId,
    secretConfigured,
  };
}

export function isValidUuid(s: string): boolean {
  return UUID_RE.test(s);
}
