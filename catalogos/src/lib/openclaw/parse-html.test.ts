import { describe, it, expect } from "vitest";
import { extractSpecSheetUrls } from "./parse-html";

describe("extractSpecSheetUrls", () => {
  it("collects absolute PDF hrefs resolved against base URL", () => {
    const html = `<a href="/files/product-sheet.pdf">Spec</a><a href="https://cdn.example.com/other.pdf">Other</a>`;
    const urls = extractSpecSheetUrls(html, "https://shop.example.com/p/1");
    expect(urls).toContain("https://shop.example.com/files/product-sheet.pdf");
    expect(urls).toContain("https://cdn.example.com/other.pdf");
  });

  it("includes non-pdf URLs when href or path hints SDS/spec/datasheet", () => {
    const html = `<a href="https://vendor.example/sds?id=99">SDS</a>`;
    expect(extractSpecSheetUrls(html, "https://shop.example.com/")).toContain("https://vendor.example/sds?id=99");
  });

  it("ignores unrelated anchors", () => {
    const html = `<a href="https://x.com/">Home</a><a href="/cart">Cart</a>`;
    expect(extractSpecSheetUrls(html, "https://shop.example.com/")).toHaveLength(0);
  });

  it("dedupes duplicate hrefs", () => {
    const html = `<a href="https://a.com/x.pdf">A</a><a href="https://a.com/x.pdf">A2</a>`;
    expect(extractSpecSheetUrls(html, "https://shop.example.com/")).toEqual(["https://a.com/x.pdf"]);
  });
});
