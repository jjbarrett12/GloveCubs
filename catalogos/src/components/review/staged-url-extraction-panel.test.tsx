// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { makeFieldEvidence } from "@/lib/product-extraction/evidence-helpers";
import type { ProductUrlExtractionV2, ProductUrlExtractionV2Summary } from "@/lib/product-extraction/types";
import { StagedUrlExtractionPanel } from "./StagedUrlExtractionPanel";
import {
  buildProductSetupContractFromExtractionV2,
  buildProductSetupContractSummary,
  PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION,
} from "@/lib/product-extraction/product-setup-contract";

function validSummary(over: Partial<ProductUrlExtractionV2Summary> = {}): ProductUrlExtractionV2Summary {
  return {
    version: "product-url-extraction-v2",
    schemaVersion: 1,
    sourceUrl: "https://example.com/glove",
    normalizedTitle: "Nitrile Exam Glove",
    brand: "Proworks",
    manufacturer: "Hospeco",
    material: "nitrile",
    disposableReusable: "disposable",
    canonicalUrl: "https://example.com/glove/canonical",
    unitsPerCase: 1000,
    caseLabel: "1,000 gloves per case",
    imageCandidateCount: 2,
    proposedVariantCount: 0,
    variantDimensions: [],
    confidence: {
      overall: 0.82,
      identity: 0.85,
      variants: 0.6,
      images: 0.78,
      packaging: 0.88,
      attributes: 0.8,
    },
    review: {
      safeToCreateMaster: true,
      safeToStageVariants: false,
      publishReadinessHints: {
        hasVariantCandidates: false,
        hasImageCandidate: true,
        hasPackagingSignal: true,
        hasSkuSourceSeparation: true,
        warnings: ["Variant list incomplete"],
      },
      blockers: ["Missing usable product image on anchor"],
      warnings: ["Low variant confidence"],
    },
    ...over,
  };
}

function minimalFull(over: Partial<ProductUrlExtractionV2> = {}): ProductUrlExtractionV2 {
  return {
    version: "product-url-extraction-v2",
    schemaVersion: 1,
    sourceUrl: "https://example.com/glove",
    fetchedAt: "2026-06-11T00:00:00.000Z",
    source: {},
    identity: {
      sourceTitle: makeFieldEvidence("Proworks Nitrile Glove", 0.9, "h1", {
        quote: "Proworks Nitrile Glove — Medium",
      }),
      brand: makeFieldEvidence("Proworks", 0.85, "meta"),
      manufacturer: makeFieldEvidence("Hospeco", 0.8, "json_ld"),
    },
    taxonomy: {
      productType: makeFieldEvidence("disposable_gloves", 0.7, "heuristic"),
      gloveType: makeFieldEvidence("exam", 0.75, "text"),
      material: makeFieldEvidence("nitrile", 0.9, "table"),
      disposableReusable: makeFieldEvidence("disposable", 0.82, "heuristic"),
    },
    commercePackaging: {
      unitsPerCase: makeFieldEvidence(1000, 0.88, "text"),
      innersPerCase: makeFieldEvidence(10, 0.88, "table"),
      unitsPerInner: makeFieldEvidence(100, 0.88, "table"),
      packTextRaw: makeFieldEvidence("10 boxes × 100 gloves", 0.7, "dom"),
      parseWarnings: ["Ambiguous inner unit noun"],
    },
    attributes: {},
    variants: { dimensions: [], options: [], proposedVariants: [], unresolvedVariantNotes: [] },
    images: { candidates: [], rejected: [] },
    documents: { specSheetUrls: [], sdsUrls: [], otherUrls: [] },
    confidence: validSummary().confidence,
    review: validSummary().review,
    ...over,
  };
}

function imageCandidate(
  id: string,
  url: string,
  role: "primary_product" | "alternate_product" | "logo" | "lifestyle" | "badge" | "unknown",
  score: number
) {
  return {
    id,
    url,
    absoluteUrl: url,
    source: "json_ld" as const,
    role,
    score,
    confidence: score,
    trust: score >= 0.7 ? ("trusted" as const) : ("weak" as const),
    reasons: [],
  };
}

function fullWithImagesAndVariants(over: Partial<ProductUrlExtractionV2> = {}): ProductUrlExtractionV2 {
  return minimalFull({
    images: {
      primaryCandidateId: "prod1",
      candidates: [
        imageCandidate("prod1", "https://example.com/product.jpg", "primary_product", 0.9),
        imageCandidate("alt1", "https://example.com/alt.jpg", "alternate_product", 0.85),
        imageCandidate("logo1", "https://example.com/logo.png", "logo", 0.1),
        imageCandidate("life1", "https://example.com/lifestyle.jpg", "lifestyle", 0.2),
      ],
      rejected: [imageCandidate("badge1", "https://example.com/badge.png", "badge", 0.05)],
    },
    variants: {
      dimensions: [
        {
          name: "size",
          options: ["S", "M", "L"],
          confidence: 0.88,
          trust: "trusted",
          source: "dom",
        },
      ],
      options: [],
      proposedVariants: [
        {
          size: "M",
          color: "Blue",
          material: "nitrile",
          pack: "100/box",
          manufacturerSku: "MFR-M",
          supplierSku: "SUP-M",
          evidence: [],
          confidence: 0.82,
          trust: "probable",
        },
      ],
      unresolvedVariantNotes: ["Size XL listed but not linked to SKU"],
    },
    ...over,
  });
}

describe("StagedUrlExtractionPanel", () => {
  afterEach(() => cleanup());

  it("renders when _extraction_v2 summary exists", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{ _extraction_v2: validSummary() }}
        rawPayload={{}}
      />
    );
    expect(screen.getByText("URL extraction (V2)")).toBeTruthy();
    expect(screen.getByRole("link", { name: "https://example.com/glove" })).toBeTruthy();
  });

  it("renders when product_setup_contract_summary exists (post-bridge path)", () => {
    const contract = buildProductSetupContractFromExtractionV2(minimalFull());
    const summary = buildProductSetupContractSummary(contract);
    render(
      <StagedUrlExtractionPanel
        normalizedData={{ product_setup_contract_summary: summary }}
        rawPayload={{ product_setup_contract_full: contract }}
      />
    );
    expect(screen.getByText("URL extraction (V2)")).toBeTruthy();
    expect(summary.schemaVersion).toBe(PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION);
  });

  it("returns null when _extraction_v2 missing", () => {
    const { container } = render(
      <StagedUrlExtractionPanel normalizedData={{}} rawPayload={{}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("summary-only path renders without full raw blob", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{ _extraction_v2: validSummary() }}
        rawPayload={{}}
      />
    );
    expect(screen.getByText("Nitrile Exam Glove")).toBeTruthy();
    expect(screen.getByText("Proworks")).toBeTruthy();
    expect(screen.queryByText("Source evidence")).toBeNull();
  });

  it("renders readiness blockers and warnings", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{ _extraction_v2: validSummary() }}
        rawPayload={{}}
      />
    );
    expect(screen.getByText("Missing usable product image on anchor")).toBeTruthy();
    expect(screen.getByText("Low variant confidence")).toBeTruthy();
    expect(screen.getByText("Variant list incomplete")).toBeTruthy();
  });

  it("renders confidence values", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{ _extraction_v2: validSummary() }}
        rawPayload={{}}
      />
    );
    expect(screen.getByText("82%")).toBeTruthy();
    expect(screen.getByText("85%")).toBeTruthy();
    expect(screen.getByText("78%")).toBeTruthy();
  });

  it("renders identity summary fields", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{ _extraction_v2: validSummary() }}
        rawPayload={{}}
      />
    );
    expect(screen.getByText("Hospeco")).toBeTruthy();
    expect(screen.getByText("nitrile")).toBeTruthy();
    expect(screen.getByText("disposable")).toBeTruthy();
    expect(screen.getByText("https://example.com/glove/canonical")).toBeTruthy();
  });

  it("renders packaging V2 signals", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{ _extraction_v2: validSummary() }}
        rawPayload={{ extraction_v2: minimalFull() }}
      />
    );
    expect(screen.getByText("1,000 gloves per case")).toBeTruthy();
    expect(screen.getByText("10 boxes × 100 gloves")).toBeTruthy();
    expect(screen.getByText("Ambiguous inner unit noun")).toBeTruthy();
    expect(
      screen.getByText("Staged commerce_packaging is shown in Case & Pallet setup below.")
    ).toBeTruthy();
  });

  it("does not mention safeToPublishVariants", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{ _extraction_v2: validSummary() }}
        rawPayload={{}}
      />
    );
    expect(screen.queryByText(/safeToPublishVariants/i)).toBeNull();
  });

  it("full blob renders images section with role labels", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{ _extraction_v2: validSummary({ imageCandidateCount: 5 }) }}
        rawPayload={{ extraction_v2: fullWithImagesAndVariants() }}
      />
    );
    expect(screen.getByText("primary product")).toBeTruthy();
    expect(screen.getByText("alternate product")).toBeTruthy();
    expect(screen.getByText("logo")).toBeTruthy();
    expect(screen.getByText("lifestyle")).toBeTruthy();
    expect(screen.getByText("badge")).toBeTruthy();
  });

  it("separates usable product images from noisy images", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{ _extraction_v2: validSummary({ imageCandidateCount: 5 }) }}
        rawPayload={{ extraction_v2: fullWithImagesAndVariants() }}
      />
    );
    expect(screen.getByText(/2 usable · 3 rejected\/noisy · 5 total/)).toBeTruthy();
    expect(screen.getByText("Usable product")).toBeTruthy();
    expect(screen.getByText("Rejected / noisy")).toBeTruthy();
  });

  it("indicates primary image when primaryCandidateId matches", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{ _extraction_v2: validSummary() }}
        rawPayload={{ extraction_v2: fullWithImagesAndVariants() }}
      />
    );
    expect(screen.getAllByText("Primary").length).toBeGreaterThanOrEqual(1);
  });

  it("summary-only row renders image fallback and anchor messaging", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{
          _extraction_v2: validSummary({
            primaryImageUrl: "https://example.com/thumb.jpg",
            imageCandidateCount: 3,
          }),
        }}
        rawPayload={{}}
      />
    );
    expect(screen.getByText("Detailed image roles are available on the family anchor row.")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("full blob renders variant dimensions", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{ _extraction_v2: validSummary({ proposedVariantCount: 1, variantDimensions: ["size"] }) }}
        rawPayload={{ extraction_v2: fullWithImagesAndVariants() }}
      />
    );
    expect(screen.getByText("size")).toBeTruthy();
    expect(screen.getByText("S, M, L")).toBeTruthy();
  });

  it("full blob renders proposed variants with manufacturer and supplier SKU columns", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{ _extraction_v2: validSummary({ proposedVariantCount: 1 }) }}
        rawPayload={{ extraction_v2: fullWithImagesAndVariants() }}
      />
    );
    expect(screen.getByText("MFR-M")).toBeTruthy();
    expect(screen.getByText("SUP-M")).toBeTruthy();
    expect(screen.getByText("Mfr SKU")).toBeTruthy();
    expect(screen.getByText("Supplier SKU")).toBeTruthy();
  });

  it("renders unresolvedVariantNotes as warnings", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{ _extraction_v2: validSummary() }}
        rawPayload={{ extraction_v2: fullWithImagesAndVariants() }}
      />
    );
    expect(screen.getByText("Size XL listed but not linked to SKU")).toBeTruthy();
  });

  it("summary-only row renders variant count and dimensions fallback", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{
          _extraction_v2: validSummary({
            proposedVariantCount: 2,
            variantDimensions: ["size", "color"],
          }),
        }}
        rawPayload={{}}
      />
    );
    expect(screen.getByText("Detailed variant evidence is available on the family anchor row.")).toBeTruthy();
    expect(screen.getByText("size, color")).toBeTruthy();
  });

  it("does not show GLV internal SKU text from variants panel", () => {
    render(
      <StagedUrlExtractionPanel
        normalizedData={{ _extraction_v2: validSummary({ proposedVariantCount: 1 }) }}
        rawPayload={{ extraction_v2: fullWithImagesAndVariants() }}
      />
    );
    expect(screen.queryByText(/GLV-/i)).toBeNull();
    expect(screen.queryByText(/proposed_glovecubs_sku/i)).toBeNull();
  });
});
