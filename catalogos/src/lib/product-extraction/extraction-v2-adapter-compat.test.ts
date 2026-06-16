import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { urlImportPayloadToParsedRow } from "@/lib/url-import/to-parsed-row";
import {
  bridgeExtractionV2ToParsedRows,
  INTERNAL_SKU_KEYS,
} from "./extraction-v2-bridge";
import { runUrlExtractionV2 } from "./url-extraction-v2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOSPECO_FIXTURE = path.resolve(
  __dirname,
  "../../../../lib/commerce-packaging/fixtures/hospeco-proworks-nitrile.html"
);

describe("extraction V2 adapter compatibility", () => {
  it("bridged rows pass urlImportPayloadToParsedRow without contaminating internal SKU fields", async () => {
    const html = fs.readFileSync(HOSPECO_FIXTURE, "utf8");
    const extraction = await runUrlExtractionV2({
      url: "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves",
      html,
    });
    const { rows } = bridgeExtractionV2ToParsedRows({ extraction });
    expect(rows.length).toBeGreaterThan(0);

    const bridged = rows[0]!;
    expect(bridged.manufacturer_sku).toBeUndefined();
    expect(bridged.supplier_sku).toBeUndefined();

    const adapted = urlImportPayloadToParsedRow({ ...bridged });
    expect(() => urlImportPayloadToParsedRow({ ...bridged })).not.toThrow();

    expect(adapted.sku).toBe("UNKNOWN");
    expect(adapted.supplier_sku).toBe("UNKNOWN");
    expect(adapted.manufacturer_sku).toBeUndefined();
    expect(adapted.manufacturer_part_number).toBeUndefined();

    for (const key of INTERNAL_SKU_KEYS) {
      if (adapted[key] != null) {
        expect(String(adapted[key])).not.toMatch(/^GLV-/i);
      }
    }
    expect(String(adapted.sku)).not.toMatch(/^GLV-/i);
    expect(String(adapted.supplier_sku)).toBe("UNKNOWN");

    expect(adapted.material).toBe("nitrile");
    expect(adapted.category_slug).toBe("disposable_gloves");
    expect((adapted.commerce_packaging as { units_per_case?: number })?.units_per_case).toBe(1000);
  });

  it("manufacturer SKU on bridged variant row survives adapter without becoming sku/supplier_sku", () => {
    const html = `<html><body>
      <h1>Nitrile Glove</h1>
      <p>Available sizes: Small, Medium.</p>
      <p>100 gloves per box. 10 boxes per case.</p>
      <table><tr><th>Material</th><td>Nitrile</td></tr></table>
      <script>"variants":[{"sku":"GL-N125F-M","option1":"M","supplierSku":"DIST-M"}]</script>
    </body></html>`;

    return runUrlExtractionV2({ url: "https://example.com/glove", html }).then((extraction) => {
      const withMfr = {
        ...extraction,
        variants: {
          ...extraction.variants,
          proposedVariants: [
            {
              size: "M",
              manufacturerSku: "GL-N125F-M",
              supplierSku: "DIST-M-001",
              evidence: [],
              confidence: 0.9,
              trust: "probable" as const,
            },
          ],
        },
      };
      const { rows } = bridgeExtractionV2ToParsedRows({ extraction: withMfr });
      const adapted = urlImportPayloadToParsedRow({ ...rows[0]! });

      expect(adapted.manufacturer_sku).toBe("GL-N125F-M");
      expect(adapted.manufacturer_part_number).toBe("GL-N125F-M");
      expect(adapted.supplier_sku).toBe("DIST-M-001");
      expect(adapted.sku).toBe("DIST-M-001");
      expect(adapted.sku).not.toBe("GL-N125F-M");
      expect(adapted.supplier_sku).not.toBe("GL-N125F-M");
    });
  });
});
