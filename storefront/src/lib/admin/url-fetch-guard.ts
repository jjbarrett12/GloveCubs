/**
 * Basic SSRF guard for server-side URL fetches (admin URL staging evidence).
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata.goog"]);

function isBlockedIpv4(host: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  const parts = host.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.some((n) => !Number.isFinite(n) || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function assertUrlSafeForServerFetch(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed.");
  }
  const host = url.hostname.toLowerCase();
  if (!host) throw new Error("Missing host.");
  if (BLOCKED_HOSTNAMES.has(host)) throw new Error("Host is not allowed.");
  if (host.endsWith(".local")) throw new Error("Host is not allowed.");
  if (host === "[::1]" || host === "::1") throw new Error("Host is not allowed.");
  if (isBlockedIpv4(host)) throw new Error("Host is not allowed.");
}
