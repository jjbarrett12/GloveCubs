import { describe, expect, it } from "vitest";
import { extractVariantsFromHtml } from "./extract-variants";

const BASE = "https://shop.example.com/p/glove";

describe("extractVariantsFromHtml", () => {
  it("creates size proposed variants from size select when no other dimensions", () => {
    const html = `<select name="size"><option value="">Choose</option>
      <option value="xs">XS</option><option value="s">S</option><option value="m">M</option>
      <option value="l">L</option><option value="xl">XL</option></select>`;
    const result = extractVariantsFromHtml({ html, pageUrl: BASE });
    expect(result.dimensions.some((d) => d.name === "size")).toBe(true);
    expect(result.proposedVariants.map((v) => v.size)).toEqual(expect.arrayContaining(["XS", "S", "M", "L", "XL"]));
    expect(result.proposedVariants.length).toBe(5);
  });

  it("does not cartesian-multiply independent size and color dimensions", () => {
    const html = `<select name="size"><option value="s">S</option><option value="m">M</option></select>
      <button class="swatch" data-value="Blue">Blue</button>
      <button class="swatch" data-value="Black">Black</button>`;
    const result = extractVariantsFromHtml({ html, pageUrl: BASE });
    expect(result.dimensions.some((d) => d.name === "size")).toBe(true);
    expect(result.dimensions.some((d) => d.name === "color")).toBe(true);
    expect(result.proposedVariants.length).toBeLessThan(4);
    expect(result.unresolvedVariantNotes.some((n) => /cartesian|combination|Multiple variant dimensions/i.test(n))).toBe(
      true
    );
  });

  it("creates confirmed variants from embedded JSON with manufacturer and supplier SKUs", () => {
    const html = `<script>{"variants":[
      {"id":1,"title":"Blue / M","sku":"MFR-BLU-M","option1":"M","option2":"Blue"},
      {"id":2,"title":"Black / L","sku":"MFR-BLK-L","option1":"L","option2":"Black"}
    ]}</script>`;
    const result = extractVariantsFromHtml({ html, pageUrl: BASE });
    expect(result.proposedVariants.length).toBe(2);
    expect(result.proposedVariants.every((v) => v.manufacturerSku?.startsWith("MFR-"))).toBe(true);
    expect(result.proposedVariants.every((v) => !/^GLV-/i.test(v.manufacturerSku ?? ""))).toBe(true);
    expect(result.proposedVariants.every((v) => !(v as { internal_sku?: string }).internal_sku)).toBe(true);
  });

  it("keeps manufacturerSku and supplierSku separate when both provided in embedded JSON records", () => {
    const html = `<script>{"variants":[{"sku":"MFR-100","barcode":"SUP-100","option1":"M"}]}</script>`;
    const result = extractVariantsFromHtml({ html, pageUrl: BASE });
    const pv = result.proposedVariants[0];
    expect(pv?.manufacturerSku).toBe("MFR-100");
    expect(pv?.supplierSku).toBeUndefined();
  });

  it("promotes SKU table family when three or more sibling SKUs share a base", () => {
    const html = `<table>
      <tr><td>Small</td><td>ABC123S</td></tr>
      <tr><td>Medium</td><td>ABC123M</td></tr>
      <tr><td>Large</td><td>ABC123L</td></tr>
      <tr><td>XL</td><td>ABC123XL</td></tr>
    </table>`;
    const result = extractVariantsFromHtml({ html, pageUrl: BASE, specTable: { sku: "ABC123M", size: "M" } });
    expect(result.proposedVariants.length).toBe(4);
    expect(result.familyBaseSku).toBe("ABC123");
    expect(result.familyEvidenceTier).toBe("strong");
  });

  it("promotes family from MainProductId CSV metadata", () => {
    const html = `<input type="hidden" name="MainProductId" value="ABC123S,ABC123M,ABC123L,ABC123XL" />`;
    const result = extractVariantsFromHtml({
      html,
      pageUrl: BASE,
      specTable: { number: "ABC123L", size: "L" },
    });
    expect(result.proposedVariants.length).toBe(4);
    expect(result.familyEvidenceTier).toBe("strong");
  });

  it("rejects GLV internal SKUs from manufacturer candidates", () => {
    const html = `<input name="MainProductId" value="GLV-TEST123,GC-TEST123,MFR-10001" />`;
    const result = extractVariantsFromHtml({ html, pageUrl: BASE });
    expect(result.manufacturerSkuCandidates).not.toContain("GLV-TEST123");
    expect(result.manufacturerSkuCandidates).not.toContain("GC-TEST123");
  });
});
