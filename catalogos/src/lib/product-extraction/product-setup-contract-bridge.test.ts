import { describe, expect, it } from "vitest";
import { runNormalization } from "@/lib/normalization/normalization-engine";
import { buildStagingPayload } from "@/lib/normalization/staging-payload";
import { extractProductSetupPassthroughFromParsedRow } from "@/lib/product-extraction/product-setup-contract";
import { bridgeExtractionV2ToParsedRows } from "@/lib/product-extraction/extraction-v2-bridge";
import { runUrlExtractionV2 } from "@/lib/product-extraction/url-extraction-v2";
import { prepareUrlImportBridgeRows } from "@/lib/url-import/bridge";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOSPECO_FIXTURE = path.join(__dirname, "fixtures/hospeco-polyethylene-gloves-small.html");
const HOSPECO_URL =
  "https://www.hospecobrands.com/products/hospeco-polyethylene-gloves-small";

describe("ProductSetupContract bridge → staging passthrough", () => {
  it("ParsedRow from bridge carries product_setup_contract_summary", async () => {
    const html = fs.readFileSync(HOSPECO_FIXTURE, "utf8");
    const extraction = await runUrlExtractionV2({ url: HOSPECO_URL, html });
    const { rows, contract } = bridgeExtractionV2ToParsedRows({ extraction });
    const row = rows[0]!;

    expect(row.product_setup_contract_summary).toBeDefined();
    expect(row._extraction_v2).toBeDefined();
    expect(row.manufacturer_sku).toBe("GL-P500S");
    expect(contract.identity.manufacturerSku).toBe("GL-P500S");
    expect(
      (row.product_setup_contract_summary as { images?: { candidates?: unknown[] } }).images?.candidates
        ?.length
    ).toBeGreaterThan(0);
  }, 120_000);

  it("prepareUrlImportBridgeRows copies full contract onto ParsedRow raw payload field", async () => {
    const html = fs.readFileSync(HOSPECO_FIXTURE, "utf8");
    const extraction = await runUrlExtractionV2({ url: HOSPECO_URL, html });
    const { rows, contract } = bridgeExtractionV2ToParsedRows({ extraction });
    const bridged = prepareUrlImportBridgeRows([
      {
        normalized_payload: rows[0] as Record<string, unknown>,
        raw_payload: { product_setup_contract: contract, extraction_v2: extraction },
      },
    ]);
    expect(bridged[0]?.product_setup_contract_full).toBeDefined();
    expect(
      (bridged[0]?.product_setup_contract_full as { identity?: { manufacturerSku?: string } }).identity
        ?.manufacturerSku
    ).toBe("GL-P500S");
  }, 120_000);

  it("normalization + staging merge preserves contract summary without changing filter_attributes", async () => {
    const html = fs.readFileSync(HOSPECO_FIXTURE, "utf8");
    const extraction = await runUrlExtractionV2({ url: HOSPECO_URL, html });
    const { rows } = bridgeExtractionV2ToParsedRows({ extraction });
    const row = rows[0] as Record<string, unknown>;

    const result = runNormalization(row);
    expect(result.filter_attributes.material).toBe("polyethylene_pe");
    expect(result.filter_attributes.thickness_mil).toBe("0.5");
    expect(result.filter_attributes.units_per_case).toBe("10000");

    const proposals = result.content.sku_proposals as { proposed_parent_sku?: string } | undefined;
    expect(proposals?.proposed_parent_sku).toBeDefined();

    const cp = result.content.commerce_packaging as { units_per_case?: number } | undefined;
    expect(cp?.units_per_case).toBe(10000);

    const payload = buildStagingPayload({
      result,
      batchId: "11111111-1111-1111-1111-111111111111",
      rawId: "22222222-2222-2222-2222-222222222222",
      supplierId: "33333333-3333-3333-3333-333333333333",
    });

    const passthrough = extractProductSetupPassthroughFromParsedRow(row);
    const staged = { ...payload.normalized_data, ...passthrough };

    expect(staged.product_setup_contract_summary).toBeDefined();
    expect(staged._extraction_v2).toBeDefined();
    expect(staged.manufacturer_sku).toBe("GL-P500S");
    expect(
      (staged.product_setup_contract_summary as { images?: { candidates?: unknown[] } }).images?.candidates
        ?.length
    ).toBeGreaterThan(0);
  }, 120_000);
});
