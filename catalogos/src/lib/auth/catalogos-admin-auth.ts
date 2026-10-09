/**
 * CatalogOS admin gate: shared secret for dashboard / import / publish surfaces.
 *
 * Production (and Vercel production/preview) fails closed when the secret is missing.
 * Local development may open routes only when `CATALOGOS_ALLOW_INSECURE_DEV_AUTH=1`.
 */

export type CatalogosAdminAuthDecision =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string; detail?: string };

export function isCatalogosProductionLikeRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnv = (env.NODE_ENV || "").trim().toLowerCase();
  const vercelEnv = (env.VERCEL_ENV || "").trim().toLowerCase();
  return nodeEnv === "production" || vercelEnv === "production" || vercelEnv === "preview";
}

export function getCatalogosAdminSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.CATALOGOS_ADMIN_SECRET?.trim();
  return secret ? secret : null;
}

export function isCatalogosInsecureDevAuthAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CATALOGOS_ALLOW_INSECURE_DEV_AUTH === "1";
}

export function getCatalogosInternalApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.INTERNAL_API_KEY?.trim();
  if (key) return key;
  // Weak default only when not production-like and insecure-dev is explicitly enabled.
  if (!isCatalogosProductionLikeRuntime(env) && isCatalogosInsecureDevAuthAllowed(env)) {
    return "dev-internal-key";
  }
  return null;
}

export function evaluateCatalogosAdminAuth(input: {
  secret: string | null;
  bearer: string;
  cookieToken: string;
  apiKey: string;
  productionLike: boolean;
  allowInsecureDev: boolean;
  internalKey: string | null;
}): CatalogosAdminAuthDecision {
  const { secret, bearer, cookieToken, apiKey, productionLike, allowInsecureDev, internalKey } = input;

  if (!secret) {
    if (productionLike) {
      return {
        ok: false,
        status: 503,
        error: "Service unavailable",
        detail: "CATALOGOS_ADMIN_SECRET is required in production-like environments",
      };
    }
    if (allowInsecureDev) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 503,
      error: "Service unavailable",
      detail:
        "CATALOGOS_ADMIN_SECRET is required (or set CATALOGOS_ALLOW_INSECURE_DEV_AUTH=1 for local open access)",
    };
  }

  const authorized =
    bearer === secret ||
    cookieToken === secret ||
    (internalKey != null && internalKey.length > 0 && (apiKey === internalKey || bearer === internalKey));

  if (!authorized) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}
