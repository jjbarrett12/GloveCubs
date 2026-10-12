import { describe, expect, it, vi } from "vitest";
import {
  assertSafeHttpUrl,
  isBlockedIpAddress,
  ssrfSafeFetch,
  type SsrfLookupFn,
} from "./index";

describe("isBlockedIpAddress", () => {
  it("blocks loopback, RFC1918, link-local, CGNAT, and metadata", () => {
    expect(isBlockedIpAddress("127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("10.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("192.168.1.1")).toBe(true);
    expect(isBlockedIpAddress("172.16.0.1")).toBe(true);
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("100.64.0.1")).toBe(true);
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(isBlockedIpAddress("fe80::1")).toBe(true);
    expect(isBlockedIpAddress("fd12::1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("allows public IPv4", () => {
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    expect(isBlockedIpAddress("1.1.1.1")).toBe(false);
  });
});

describe("assertSafeHttpUrl", () => {
  const publicLookup: SsrfLookupFn = async () => ["8.8.8.8"];
  const privateLookup: SsrfLookupFn = async () => ["10.1.2.3"];
  const metadataLookup: SsrfLookupFn = async () => ["169.254.169.254"];

  it("blocks localhost and metadata hostnames without DNS", async () => {
    expect((await assertSafeHttpUrl("http://localhost/x")).ok).toBe(false);
    expect((await assertSafeHttpUrl("http://127.0.0.1/x")).ok).toBe(false);
    expect((await assertSafeHttpUrl("http://169.254.169.254/latest")).ok).toBe(false);
    expect((await assertSafeHttpUrl("http://metadata.google.internal/")).ok).toBe(false);
  });

  it("blocks RFC1918 literals", async () => {
    expect((await assertSafeHttpUrl("http://192.168.0.5/")).ok).toBe(false);
    expect((await assertSafeHttpUrl("http://10.0.0.8/")).ok).toBe(false);
    expect((await assertSafeHttpUrl("http://172.16.4.4/")).ok).toBe(false);
  });

  it("allows https public hostnames that resolve publicly", async () => {
    const r = await assertSafeHttpUrl("https://cdn.example.com/p.png", publicLookup);
    expect(r.ok).toBe(true);
  });

  it("blocks public hostnames that resolve to private IPs", async () => {
    const r = await assertSafeHttpUrl("https://evil.example.com/", privateLookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/private or metadata/i);
  });

  it("blocks DNS to metadata IP", async () => {
    const r = await assertSafeHttpUrl("https://not-metadata.example/", metadataLookup);
    expect(r.ok).toBe(false);
  });
});

describe("ssrfSafeFetch redirects", () => {
  it("does not follow a public URL redirect into a private IP", async () => {
    const lookup: SsrfLookupFn = async (hostname) => {
      if (hostname === "shop.example.com") return ["93.184.216.34"];
      throw new Error(`unexpected lookup ${hostname}`);
    };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.includes("shop.example.com")) {
        return new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/secret" } });
      }
      throw new Error(`fetch should not reach ${href}`);
    }) as unknown as typeof fetch;

    const r = await ssrfSafeFetch("https://shop.example.com/product", {
      lookup,
      fetchImpl,
      timeoutMs: 2000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.security_blocked).toBe(true);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not follow redirect to 169.254.169.254", async () => {
    const lookup: SsrfLookupFn = async (hostname) => {
      if (hostname === "ok.example") return ["1.2.3.4"];
      throw new Error(`unexpected lookup ${hostname}`);
    };
    const fetchImpl = vi.fn(async () => {
      return new Response(null, {
        status: 301,
        headers: { Location: "http://169.254.169.254/latest/meta-data/" },
      });
    }) as unknown as typeof fetch;

    const r = await ssrfSafeFetch("https://ok.example/img", { lookup, fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.security_blocked).toBe(true);
  });

  it("follows a redirect to another public host", async () => {
    const lookup: SsrfLookupFn = async (hostname) => {
      if (hostname === "a.example" || hostname === "b.example") return ["8.8.8.8"];
      throw new Error(`unexpected lookup ${hostname}`);
    };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.includes("a.example")) {
        return new Response(null, { status: 302, headers: { Location: "https://b.example/final" } });
      }
      return new Response("hello", { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const r = await ssrfSafeFetch("https://a.example/", { lookup, fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.buffer.toString()).toBe("hello");
      expect(r.status).toBe(200);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
