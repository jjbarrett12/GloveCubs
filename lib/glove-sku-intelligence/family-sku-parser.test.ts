import { describe, expect, it } from "vitest";
import {
  clusterSkuFamily,
  parseManufacturerSkuFamily,
  stripKnownSizeSuffixWithParser,
} from "./family-sku-parser";
import { stripKnownSizeSuffix } from "./index";

const N105ORF_FAMILY = ["N105ORFS", "N105ORFM", "N105ORFL", "N105ORFX", "N105ORFXL"];

describe("parseManufacturerSkuFamily — N105ORF regression fixture", () => {
  const ctx = { clusterMembers: N105ORF_FAMILY };

  it("parses each size with base N105ORF", () => {
    expect(parseManufacturerSkuFamily("N105ORFS", ctx)).toMatchObject({
      parentBase: "N105ORF",
      sizeCode: "S",
      matchedSuffix: "S",
    });
    expect(parseManufacturerSkuFamily("N105ORFM", ctx)).toMatchObject({
      parentBase: "N105ORF",
      sizeCode: "M",
    });
    expect(parseManufacturerSkuFamily("N105ORFL", ctx)).toMatchObject({
      parentBase: "N105ORF",
      sizeCode: "L",
    });
    expect(parseManufacturerSkuFamily("N105ORFX", ctx)).toMatchObject({
      parentBase: "N105ORF",
      sizeCode: "X",
      matchedSuffix: "X",
    });
    expect(parseManufacturerSkuFamily("N105ORFXL", ctx)).toMatchObject({
      parentBase: "N105ORF",
      sizeCode: "XL",
      matchedSuffix: "XL",
    });
  });

  it("keeps X and XL distinct in cluster", () => {
    const cluster = clusterSkuFamily(N105ORF_FAMILY);
    expect(cluster?.parentBase).toBe("N105ORF");
    expect(cluster?.sizeCodes.sort()).toEqual(["L", "M", "S", "X", "XL"]);
    expect(cluster?.members).toHaveLength(5);
  });

  it("stripKnownSizeSuffix(N105ORFXL) returns N105ORF, not N105ORFX", () => {
    expect(stripKnownSizeSuffix("N105ORFXL")).toBe("N105ORF");
    expect(stripKnownSizeSuffix("N105ORFXL")).not.toBe("N105ORFX");
  });
});

describe("parseManufacturerSkuFamily — generic glued suffixes", () => {
  const cluster = ["ABC123S", "ABC123M", "ABC123L", "ABC123XL"];
  const ctx = { clusterMembers: cluster };

  it("infers base ABC123 for S/M/L/XL cluster", () => {
    expect(parseManufacturerSkuFamily("ABC123S", ctx)?.parentBase).toBe("ABC123");
    expect(parseManufacturerSkuFamily("ABC123M", ctx)?.parentBase).toBe("ABC123");
    expect(parseManufacturerSkuFamily("ABC123L", ctx)?.parentBase).toBe("ABC123");
    expect(parseManufacturerSkuFamily("ABC123XL", ctx)?.parentBase).toBe("ABC123");
  });

  it("does not collapse XL into L or XS into S", () => {
    const withXs = ["ABC123XS", "ABC123S", "ABC123XL", "ABC123L"];
    const parsed = withXs.map((s) => parseManufacturerSkuFamily(s, { clusterMembers: withXs }));
    const sizes = parsed.map((p) => p?.sizeCode);
    expect(sizes).toContain("XS");
    expect(sizes).toContain("S");
    expect(sizes).toContain("XL");
    expect(sizes).toContain("L");
    expect(new Set(sizes).size).toBe(4);
  });
});

describe("parseManufacturerSkuFamily — generic compact SM/MD/LG", () => {
  const cluster = ["ABC123SM", "ABC123MD", "ABC123LG", "ABC123XL"];
  const ctx = { clusterMembers: cluster };

  it("maps compact suffixes to S/M/L/XL", () => {
    expect(parseManufacturerSkuFamily("ABC123SM", ctx)).toMatchObject({ parentBase: "ABC123", sizeCode: "S" });
    expect(parseManufacturerSkuFamily("ABC123MD", ctx)).toMatchObject({ parentBase: "ABC123", sizeCode: "M" });
    expect(parseManufacturerSkuFamily("ABC123LG", ctx)).toMatchObject({ parentBase: "ABC123", sizeCode: "L" });
    expect(parseManufacturerSkuFamily("ABC123XL", ctx)).toMatchObject({ parentBase: "ABC123", sizeCode: "XL" });
  });
});

describe("parseManufacturerSkuFamily — hyphenated suffixes", () => {
  const cluster = ["ABC123-XS", "ABC123-S", "ABC123-M", "ABC123-L", "ABC123-XL"];
  const ctx = { clusterMembers: cluster };

  it("infers base ABC123 for hyphenated sizes", () => {
    for (const sku of cluster) {
      expect(parseManufacturerSkuFamily(sku, ctx)?.parentBase).toBe("ABC123");
    }
    expect(clusterSkuFamily(cluster)?.sizeCodes.sort()).toEqual(["L", "M", "S", "XL", "XS"]);
  });
});

describe("parseManufacturerSkuFamily — numeric glove sizes", () => {
  const cluster = ["ABC12307", "ABC12308", "ABC12309", "ABC12310"];

  it("parses numeric sizes only with cluster evidence", () => {
    expect(parseManufacturerSkuFamily("ABC12307")).toBeNull();
    const ctx = { clusterMembers: cluster };
    expect(parseManufacturerSkuFamily("ABC12307", ctx)).toMatchObject({
      parentBase: "ABC123",
      sizeCode: "07",
    });
    expect(clusterSkuFamily(cluster)?.parentBase).toBe("ABC123");
  });

  it("does not treat random trailing digits as size without cluster", () => {
    expect(parseManufacturerSkuFamily("WIDGET99")).toBeNull();
  });
});

describe("parseManufacturerSkuFamily — internal SKU rejection", () => {
  it("rejects GLV- and GC- prefixed SKUs", () => {
    expect(parseManufacturerSkuFamily("GLV-N105ORFXL")).toBeNull();
    expect(parseManufacturerSkuFamily("GC-N105ORFXL")).toBeNull();
  });

  it("allows GL-N125FL as manufacturer Hospeco SKU", () => {
    const parse = parseManufacturerSkuFamily("GL-N125FL");
    expect(parse).not.toBeNull();
    expect(parse?.parentBase).toBe("GL-N125F");
    expect(parse?.decoderId).toBe("hospeco_gl_n125f");
  });
});

describe("stripKnownSizeSuffixWithParser — Hospeco preservation", () => {
  it("preserves Hospeco hyphenated and compact results", () => {
    expect(stripKnownSizeSuffix("GL-N125F-L")).toBe("GL-N125F");
    expect(stripKnownSizeSuffix("GL-N125FL")).toBe("GL-N125F");
    expect(stripKnownSizeSuffix("GL-N125FXL")).toBe("GL-N125F");
  });
});
