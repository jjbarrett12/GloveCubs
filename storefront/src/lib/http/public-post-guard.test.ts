import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { guardPublicJsonPost, guardPublicMultipartPost } from "./public-post-guard";

describe("public-post-guard", () => {
  it("rejects non-JSON content type", () => {
    const req = new NextRequest("http://localhost/api/contact", {
      method: "POST",
      headers: { "content-type": "text/plain" },
    });
    const res = guardPublicJsonPost(req);
    expect(res?.status).toBe(415);
  });

  it("rejects oversized Content-Length", () => {
    const req = new NextRequest("http://localhost/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(999999) },
    });
    const res = guardPublicJsonPost(req, { maxBytes: 100 });
    expect(res?.status).toBe(413);
  });

  it("allows application/json within size", () => {
    const req = new NextRequest("http://localhost/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", "content-length": "12" },
    });
    expect(guardPublicJsonPost(req)).toBeNull();
  });

  it("rejects non-multipart for upload guard", () => {
    const req = new NextRequest("http://localhost/api/invoice/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(guardPublicMultipartPost(req)?.status).toBe(415);
  });
});
