import {
  CATALOGOS_DEV_DEFAULT_BASE_URL,
  isProductionLike,
  resolveCatalogosInternalApiKey,
  resolveCatalogosInternalBaseUrl,
} from "@/lib/admin/catalogos-internal-client";

export type ProductsImportConnectionStatus = {
  /** True when CatalogOS is reachable for import proxies (URL + key rules satisfied). */
  configured: boolean;
  catalogos_url_configured: boolean;
  catalogos_base_url: string | null;
  using_dev_default_url: boolean;
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
  const catalogos_base_url = base.ok ? base.baseUrl : null;
  const explicitUrl = Boolean(
    process.env.CATALOGOS_INTERNAL_URL?.trim() || process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim()
  );
  const using_dev_default_url = catalogos_url_configured && !explicitUrl && !isProductionLike();

  const keyRaw = process.env.INTERNAL_API_KEY?.trim() ?? "";
  const internal_key_configured = keyRaw.length > 0;

  const keyRes = resolveCatalogosInternalApiKey();
  const production_key_safe = keyRes.ok;

  if (!catalogos_url_configured) {
    return {
      configured: false,
      catalogos_url_configured: false,
      catalogos_base_url: null,
      using_dev_default_url: false,
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
      catalogos_base_url,
      using_dev_default_url: false,
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
  if (using_dev_default_url) {
    message += ` Using development default ${CATALOGOS_DEV_DEFAULT_BASE_URL} — start CatalogOS locally or set CATALOGOS_INTERNAL_URL.`;
  }
  if (!isProductionLike() && !internal_key_configured) {
    message +=
      " INTERNAL_API_KEY is unset; development will use the default dev key when calling CatalogOS (set a real key to match production).";
  }

  return {
    configured: true,
    catalogos_url_configured: true,
    catalogos_base_url,
    using_dev_default_url,
    internal_key_configured,
    production_key_safe,
    status: "online",
    message,
  };
}
