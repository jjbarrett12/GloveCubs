/**
 * Fetch a remote feed URL. Used by the ingestion pipeline to pull CSV or JSON.
 * No parsing here — returns body and content-type for parser dispatch.
 */

import type { FetchedFeed } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

export interface FetchFeedOptions {
  url: string;
  timeoutMs?: number;
  maxBytes?: number;
}

/**
 * Fetch feed from URL. Returns text body and content-type.
 * Throws on network error, non-2xx, or body too large.
 */
export async function fetchFeed(options: FetchFeedOptions): Promise<FetchedFeed> {
  const { url, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_BODY_BYTES } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "text/csv, application/json, application/x-ndjson, text/plain" },
    });

    clearTimeout(timeoutId);

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const body = await res.text();

    if (body.length > maxBytes) {
      throw new Error(`Feed body exceeds ${maxBytes} bytes`);
    }

    return {
      body,
      contentType: contentType || "application/octet-stream",
      ok: res.ok,
      status: res.status,
    };
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error) {
      if (e.name === "AbortError") throw new Error("Feed fetch timed out");
      throw e;
    }
    throw new Error("Feed fetch failed");
  }
}
