import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extractImportDraftFromHtml } from "@/lib/admin/import-draft-mapper";
import {
  importDraftToProductWriteInput,
  previewPromoteVariantRows,
} from "@/lib/admin/import-draft-promote";
import { buildSkuProposalApplyPatch } from "@/lib/admin/import-suggestion-mapper";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Hospeco import SKU smoke", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "fixtures", "hospeco-proworks-multi-size.html"),
    "utf8"
  );
  const url =
    "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves-powder-free-3-mil-hos-gl-n125f-l-gl-n125fl";

  it("draft → promote write input separates GLV and manufacturer SKUs", () => {
    const draft = extractImportDraftFromHtml(html, url);
    expect(draft.proposed_parent_sku).toBe("GLV-GL-N125");

    const writeInput = importDraftToProductWriteInput(draft, { category_id: "cat-disposable" });
    expect(writeInput.internalSku).toBe("GLV-GL-N125");
    expect(writeInput.importDraft).toBe(draft);

    const codes = writeInput.variants.map((v) => v.sizeCode);
    expect(codes).toEqual(["XS", "S", "M", "L", "XL"]);

    expect(writeInput.variants.map((v) => v.variantSku)).toEqual([
      "GLV-GL-N125XS",
      "GLV-GL-N125S",
      "GLV-GL-N125M",
      "GLV-GL-N125L",
      "GLV-GL-N125XL",
    ]);

    const preview = previewPromoteVariantRows(writeInput);
    for (const row of preview) {
      expect(row.variant_sku.startsWith("GLV-")).toBe(true);
      expect(row.metadata.manufacturer_sku).toMatch(/^GL-N125F-/);
      expect(row.variant_sku).not.toBe(row.metadata.manufacturer_sku);
    }
  });

  it("apply patch fills empty editor fields without overwriting existing SKUs", () => {
    const draft = extractImportDraftFromHtml(html, url);
    const { patch, skippedCount } = buildSkuProposalApplyPatch(
      draft,
      "GLV-EXISTING",
      draft.variants.map((v) => ({
        sizeCode: v.normalized_size_code,
        variantSku: v.normalized_size_code === "M" ? "GLV-KEEP-M" : "",
        listPrice: "",
      }))
    );
    expect(skippedCount).toBeGreaterThanOrEqual(1);
    expect(patch.internalSku).toBeUndefined();
    const m = patch.variants?.find((v) => v.sizeCode === "M");
    expect(m?.variantSku).toBe("GLV-KEEP-M");
    const xs = patch.variants?.find((v) => v.sizeCode === "XS");
    expect(xs?.variantSku).toBe("GLV-GL-N125XS");
  });
});

describe("Hospeco MainProductId live-style SKU smoke", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "fixtures", "hospeco-proworks-main-product-id.html"),
    "utf8"
  );
  const url = "https://www.hospecobrands.com/products/proworks-nitrile-gl-n125f";

  it("draft → promote write payload from MainProductId fixture", () => {
    const draft = extractImportDraftFromHtml(html, url);
    const writeInput = importDraftToProductWriteInput(draft, { category_id: "cat-disposable" });
    expect(writeInput.internalSku).toBe("GLV-GL-N125");
    expect(writeInput.variants.map((v) => v.variantSku)).toEqual([
      "GLV-GL-N125XS",
      "GLV-GL-N125S",
      "GLV-GL-N125M",
      "GLV-GL-N125L",
      "GLV-GL-N125XL",
    ]);
    const preview = previewPromoteVariantRows(writeInput);
    expect(preview.map((r) => r.metadata.manufacturer_sku)).toEqual([
      "GL-N125F-XS",
      "GL-N125F-S",
      "GL-N125F-M",
      "GL-N125F-L",
      "GL-N125F-XL",
    ]);
  });
});
