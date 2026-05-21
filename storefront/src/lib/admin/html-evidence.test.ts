import { describe, expect, it } from "vitest";
import { extractJsonLdProduct, extractPageEvidence, jsonLdProductHints } from "@/lib/admin/html-evidence";

describe("html-evidence JSON-LD", () => {
  it("extracts Product node fields for clipboard staging", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
        {"@type":"Product","name":"Nitrile Exam Glove","sku":"GL-100-S","brand":{"@type":"Brand","name":"Acme"},"description":"4 mil blue"}
        </script>
      </head></html>`;
    const evidence = extractPageEvidence(html);
    const hints = jsonLdProductHints(evidence.jsonLdProduct);
    expect(hints.name).toBe("Nitrile Exam Glove");
    expect(hints.sku).toBe("GL-100-S");
    expect(hints.brand).toBe("Acme");
    expect(extractJsonLdProduct(html)).not.toBeNull();
  });
});
