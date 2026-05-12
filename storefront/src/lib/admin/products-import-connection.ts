import {
  isProductionLike,
  resolveCatalogosInternalApiKey,
  resolveCatalogosInternalBaseUrl,
} from "@/lib/admin/catalogos-internal-client";

export type ProductsImportConnectionStatus = {
  /** True when CatalogOS is reachable for import proxies (URL + key rules satisfied). */
  configured: boolean;
  catalogos_url_configured: boolean;
  internal_key_configured: boolean;
  production_key_safe: boolean;
  status: "online" | "offline" | "misconfigured";
  message: string;
};

/**
 * Env-only connection status for import UI and GET /admin/api/products/import/status.
 * Does not call CatalogOS (no fake readiness from network).
 */
export function computeProductsImportConnectionStatus(): ProductsImportConnectionStatus {
  const base = resolveCatalogosInternalBaseUrl();
  const catalogos_url_configured = base.ok;

  const keyRaw = process.env.INTERNAL_API_KEY?.trim() ?? "";
  const internal_key_configured = keyRaw.length > 0;

  const keyRes = resolveCatalogosInternalApiKey();
  const production_key_safe = keyRes.ok;

  if (!catalogos_url_configured) {
    return {
      configured: false,
      catalogos_url_configured: false,
      internal_key_configured,
      production_key_safe,
      status: "offline",
      message:
        "Ingestion offline — configure CatalogOS connection. Set CATALOGOS_INTERNAL_URL (server-only base URL for CatalogOS).",
    };
  }

  if (isProductionLike() && !production_key_safe) {
    return {
      configured: false,
      catalogos_url_configured: true,
      internal_key_configured,
      production_key_safe: false,
      status: "misconfigured",
      message:
        keyRes.ok === false
          ? keyRes.reason
          : "CatalogOS URL is set but the internal API key is not safe for production.",
    };
  }

  let message =
    "CatalogOS connection is configured. Ingestion, extraction, matching, staging, and publish run in CatalogOS — not in storefront admin.";
  if (!isProductionLike() && !internal_key_configured) {
    message +=
      " INTERNAL_API_KEY is unset; development will use the default dev key when calling CatalogOS (set a real key to match production).";
  }

  return {
    configured: true,
    catalogos_url_configured: true,
    internal_key_configured,
    production_key_safe,
    status: "online",
    message,
  };
}
