/**
 * Shared SSRF-safe HTTP fetch: DNS + hop-by-hop redirect validation.
 * Used by storefront admin import and CatalogOS URL/image ingest.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export const SSRF_MAX_REDIRECTS = 5;
export const SSRF_DEFAULT_TIMEOUT_MS = 10_000;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal",
  "metadata.google.com",
  "169.254.169.254",
  "metadata.internal",
]);

export type SsrfLookupFn = (hostname: string) => Promise<string[]>;

export type SsrfAssertResult =
  | { ok: true; url: URL; resolvedIps: string[] }
  | { ok: false; error: string; security_blocked: true };

export class SsrfBlockedError extends Error {
  readonly security_blocked = true as const;
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0]! << 24) | (nums[1]! << 16) | (nums[2]! << 8) | nums[3]!) >>> 0;
}

function inCidr(ipInt: number, base: string, prefix: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt == null) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/** True for loopback, RFC1918, link-local, CGNAT, metadata, IPv6 ULA/link-local. */
export function isBlockedIpAddress(ip: string): boolean {
  const raw = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (raw.startsWith("::ffff:")) {
    return isBlockedIpAddress(raw.slice(7));
  }
  if (raw === "::1" || raw === "0:0:0:0:0:0:0:1") return true;
  if (raw.startsWith("fc") || raw.startsWith("fd")) return true;
  if (raw.startsWith("fe80:")) return true;

  const kind = isIP(raw);
  if (kind === 4) {
    const n = ipv4ToInt(raw);
    if (n == null) return true;
    if (inCidr(n, "0.0.0.0", 8)) return true;
    if (inCidr(n, "10.0.0.0", 8)) return true;
    if (inCidr(n, "127.0.0.0", 8)) return true;
    if (inCidr(n, "169.254.0.0", 16)) return true;
    if (inCidr(n, "172.16.0.0", 12)) return true;
    if (inCidr(n, "192.168.0.0", 16)) return true;
    if (inCidr(n, "100.64.0.0", 10)) return true;
    return false;
  }
  if (kind === 6) {
    return false;
  }
  return true;
}

function hostnameBlocked(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h.endsWith(".internal") || h.endsWith(".corp")) return true;
  return false;
}

export async function defaultDnsLookup(hostname: string): Promise<string[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  const ips = results.map((r) => r.address).filter(Boolean);
  return [...new Set(ips)];
}

export async function assertSafeHttpUrl(
  urlString: string,
  lookup: SsrfLookupFn = defaultDnsLookup,
): Promise<SsrfAssertResult> {
  if (!urlString || typeof urlString !== "string") {
    return { ok: false, error: "URL is required", security_blocked: true };
  }
  const trimmed = urlString.trim();
  if (/^(javascript|data|file|ftp):/i.test(trimmed)) {
    return { ok: false, error: "Invalid URL protocol", security_blocked: true };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Invalid URL format", security_blocked: true };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: `Protocol not allowed: ${url.protocol}`, security_blocked: true };
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname.length > 255) {
    return { ok: false, error: "Hostname too long", security_blocked: true };
  }
  if (hostnameBlocked(hostname)) {
    return { ok: false, error: "Internal hostname not allowed", security_blocked: true };
  }
  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      return { ok: false, error: "Private or link-local IP not allowed", security_blocked: true };
    }
    return { ok: true, url, resolvedIps: [hostname] };
  }
  let resolvedIps: string[];
  try {
    resolvedIps = await lookup(hostname);
  } catch {
    return { ok: false, error: "DNS lookup failed", security_blocked: true };
  }
  if (!resolvedIps.length) {
    return { ok: false, error: "DNS lookup returned no addresses", security_blocked: true };
  }
  for (const ip of resolvedIps) {
    if (isBlockedIpAddress(ip)) {
      return { ok: false, error: "Host resolves to a private or metadata address", security_blocked: true };
    }
  }
  return { ok: true, url, resolvedIps };
}

export type SsrfFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRedirects?: number;
  lookup?: SsrfLookupFn;
  fetchImpl?: typeof fetch;
};

export type SsrfFetchOk = {
  ok: true;
  status: number;
  url: string;
  final_url: string;
  content_type: string;
  buffer: Buffer;
  fetch_time_ms: number;
};

export type SsrfFetchErr = {
  ok: false;
  url: string;
  error: string;
  security_blocked?: boolean;
  fetch_time_ms: number;
  status?: number;
  final_url?: string;
  content_type?: string;
};

export async function ssrfSafeFetch(urlString: string, init: SsrfFetchInit = {}): Promise<SsrfFetchOk | SsrfFetchErr> {
  const start = Date.now();
  const timeoutMs = init.timeoutMs ?? SSRF_DEFAULT_TIMEOUT_MS;
  const maxRedirects = init.maxRedirects ?? SSRF_MAX_REDIRECTS;
  const fetchImpl = init.fetchImpl ?? fetch;
  const lookup = init.lookup ?? defaultDnsLookup;

  let current = urlString.trim();
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const gate = await assertSafeHttpUrl(current, lookup);
    if (!gate.ok) {
      return { ok: false, url: urlString, error: gate.error, security_blocked: true, fetch_time_ms: Date.now() - start };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(gate.url.toString(), {
        method: init.method ?? "GET",
        headers: init.headers,
        redirect: "manual",
        signal: controller.signal,
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) {
          return {
            ok: false,
            url: urlString,
            error: "Redirect missing Location",
            security_blocked: true,
            fetch_time_ms: Date.now() - start,
            status: res.status,
          };
        }
        let next: URL;
        try {
          next = new URL(loc, gate.url);
        } catch {
          return {
            ok: false,
            url: urlString,
            error: "Invalid redirect Location",
            security_blocked: true,
            fetch_time_ms: Date.now() - start,
          };
        }
        current = next.toString();
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        ok: true,
        status: res.status,
        url: urlString,
        final_url: res.url || gate.url.toString(),
        content_type: res.headers.get("content-type") ?? "",
        buffer: buf,
        fetch_time_ms: Date.now() - start,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("abort")) {
        return { ok: false, url: urlString, error: "Request timeout", fetch_time_ms: Date.now() - start };
      }
      return { ok: false, url: urlString, error: `Fetch failed: ${msg}`, fetch_time_ms: Date.now() - start };
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    ok: false,
    url: urlString,
    error: `Too many redirects (max ${maxRedirects})`,
    security_blocked: true,
    fetch_time_ms: Date.now() - start,
  };
}
