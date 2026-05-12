/**
 * Server-only CatalogOS HTTP client for admin import proxies.
 * Never import from client components — secrets stay on the server.
 */

const DEFAULT_DEV_KEY = "dev-internal-key";
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export function isProductionLike(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export type CatalogosInternalKeyResult =
  | { ok: true; key: string }
  | { ok: false; reason: string; blockedInProduction: boolean };

/**
 * Resolves INTERNAL_API_KEY for CatalogOS requests.
 * Production: missing or default key is refused (blockedInProduction true).
 */
export function resolveCatalogosInternalApiKey(): CatalogosInternalKeyResult {
  const raw = process.env.INTERNAL_API_KEY;
  const trimmed = raw?.trim() ?? "";
  if (!isProductionLike()) {
    return { ok: true, key: trimmed || DEFAULT_DEV_KEY };
  }
  if (!trimmed) {
    return { ok: false, reason: "INTERNAL_API_KEY missing in production", blockedInProduction: true };
  }
  if (trimmed === DEFAULT_DEV_KEY) {
    return {
      ok: false,
      reason: "INTERNAL_API_KEY must not use default dev-internal-key in production",
      blockedInProduction: true,
    };
  }
  return { ok: true, key: trimmed };
}

export type CatalogosInternalBaseUrlResult =
  | { ok: true; baseUrl: string }
  | { ok: false; reason: string };

/** Base URL for server-to-CatalogOS calls (no trailing slash). */
export function resolveCatalogosInternalBaseUrl(): CatalogosInternalBaseUrlResult {
  const raw = process.env.CATALOGOS_INTERNAL_URL?.trim() ?? "";
  if (!raw) {
    return { ok: false, reason: "CATALOGOS_INTERNAL_URL is not set" };
  }
  return { ok: true, baseUrl: raw.replace(/\/+$/, "") };
}

/**
 * Joins base + path safely (path must start with `/`).
 */
export function buildCatalogosInternalUrl(baseUrl: string, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/, "")}${p}`;
}

function resolveTimeoutMs(): number {
  const raw = process.env.CATALOGOS_INTERNAL_TIMEOUT_MS ?? process.env.CATALOGOS_RESOLVE_TIMEOUT_MS;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1000) return Math.min(n, 120_000);
  return 25_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type CatalogosInternalRequestError = {
  kind: "config" | "auth" | "http" | "network" | "parse";
  message: string;
  status?: number;
};

export type CatalogosInternalRequestResult<T = unknown> =
  | { ok: true; status: number; data: T }
  | { ok: false; error: CatalogosInternalRequestError };

export type CatalogosInternalRequestOptions = {
  method: "GET" | "POST";
  /** Absolute path on CatalogOS host, e.g. `/api/admin/url-import` */
  path: string;
  body?: unknown;
  /**
   * Override per-call timeout (ms). Falls back to CATALOGOS_INTERNAL_TIMEOUT_MS /
   * CATALOGOS_RESOLVE_TIMEOUT_MS / 25s. Capped at 5 minutes.
   */
  timeoutMs?: number;
  /**
   * Override retry attempts (1..3). Defaults to 3. Set 1 for non-idempotent calls
   * (e.g. CatalogOS POST creates a job before crawling completes).
   */
  maxAttempts?: number;
};

/**
 * Authenticated GET/POST to CatalogOS with bounded timeout and retries on transient failures.
 * Refuses production when INTERNAL_API_KEY is missing or default.
 */
export async function catalogosInternalRequest<T = unknown>(
  options: CatalogosInternalRequestOptions
): Promise<CatalogosInternalRequestResult<T>> {
  const base = resolveCatalogosInternalBaseUrl();
  if (!base.ok) {
    return { ok: false, error: { kind: "config", message: base.reason } };
  }

  const key = resolveCatalogosInternalApiKey();
  if (!key.ok) {
    return {
      ok: false,
      error: {
        kind: "auth",
        message: key.reason,
        status: key.blockedInProduction ? 503 : undefined,
      },
    };
  }

  const url = buildCatalogosInternalUrl(base.baseUrl, options.path);
  const timeoutMs =
    typeof options.timeoutMs === "number" && options.timeoutMs >= 1000
      ? Math.min(options.timeoutMs, 300_000)
      : resolveTimeoutMs();
  const maxAttempts =
    typeof options.maxAttempts === "number" && options.maxAttempts >= 1
      ? Math.min(Math.floor(options.maxAttempts), MAX_ATTEMPTS)
      : MAX_ATTEMPTS;
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: options.method,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key.key,
        },
        body: options.method === "POST" && options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: ac.signal,
      });
      clearTimeout(timer);
      lastStatus = res.status;

      const text = await res.text().catch(() => "");
      if (!res.ok) {
        if (attempt < maxAttempts && RETRYABLE_STATUS.has(res.status)) {
          await sleep(300 * attempt + Math.floor(Math.random() * 120));
          continue;
        }
        return {
          ok: false,
          error: {
            kind: "http",
            message: text?.slice(0, 500) || res.statusText || "CatalogOS request failed",
            status: res.status,
          },
        };
      }

      if (!text.trim()) {
        return { ok: false, error: { kind: "parse", message: "empty_catalogos_response", status: res.status } };
      }

      try {
        const data = JSON.parse(text) as T;
        return { ok: true, status: res.status, data };
      } catch {
        return { ok: false, error: { kind: "parse", message: "invalid_json", status: res.status } };
      }
    } catch (e) {
      clearTimeout(timer);
      const aborted = e instanceof Error && e.name === "AbortError";
      if (attempt < maxAttempts && (aborted || e instanceof TypeError)) {
        await sleep(300 * attempt + Math.floor(Math.random() * 120));
        continue;
      }
      return {
        ok: false,
        error: {
          kind: "network",
          message: aborted ? "catalogos_timeout" : "catalogos_fetch_failed",
          status: aborted ? 408 : lastStatus,
        },
      };
    }
  }

  return {
    ok: false,
    error: { kind: "http", message: "catalogos_exhausted_retries", status: lastStatus },
  };
}
