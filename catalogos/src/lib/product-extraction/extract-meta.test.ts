import { describe, expect, it } from "vitest";
import { extractMetaFromHtml } from "./extract-meta";
import { extractImagesFromHtml, ogImageUrlFromEvidence } from "./extract-images";

describe("extractMetaFromHtml", () => {
  const html = `<!DOCTYPE html><html><head>
    <title>Store | Nitrile Glove PDP</title>
    <link rel="canonical" href="https://shop.example.com/products/nitrile-glove" />
    <meta property="og:title" content="OG Nitrile Glove Title" />
    <meta property="og:image" content="https://cdn.example.com/og-glove.jpg" />
    <meta property="og:description" content="OG description for nitrile glove." />
    <meta name="description" content="Meta description nitrile glove powder free." />
  </head><body><h1>H1 Nitrile Exam Glove</h1></body></html>`;

  it("extracts canonical, titles, and descriptions", () => {
    const result = extractMetaFromHtml(html, "https://shop.example.com/products/nitrile-glove");
    expect(result.canonicalUrl).toBe("https://shop.example.com/products/nitrile-glove");
    expect(result.pageTitle).toContain("Nitrile Glove");
    expect(result.ogTitle?.value).toBe("OG Nitrile Glove Title");
    expect(result.metaDescription?.value).toMatch(/Meta description/i);
    expect(result.h1Candidates[0]?.value).toBe("H1 Nitrile Exam Glove");
  });

  it("feeds OG image into image extraction context", () => {
    const meta = extractMetaFromHtml(html, "https://shop.example.com/products/nitrile-glove");
    const ogUrl = ogImageUrlFromEvidence(meta.ogImage);
    const images = extractImagesFromHtml({
      html,
      pageUrl: "https://shop.example.com/products/nitrile-glove",
      ogImageUrl: ogUrl,
    });
    expect(images.candidates.some((c) => c.absoluteUrl.includes("og-glove.jpg"))).toBe(true);
  });
});
