// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { ProductSetupWizardPanel } from "./ProductSetupWizardPanel";
import {
  buildProductSetupContractFromExtractionV2,
  buildProductSetupContractSummary,
} from "@/lib/product-extraction/product-setup-contract";
import { makeFieldEvidence } from "@/lib/product-extraction/evidence-helpers";
import type { ProductUrlExtractionV2 } from "@/lib/product-extraction/types";

vi.mock("@/app/actions/review-setup-wizard", () => ({
  applyProductSetupWizardFields: vi.fn(async () => ({
    appliedFields: ["title"],
    skippedFields: [],
    errors: [],
    readiness: null,
  })),
}));

import { applyProductSetupWizardFields } from "@/app/actions/review-setup-wizard";

function minimalExtraction(): ProductUrlExtractionV2 {
  return {
    version: "product-url-extraction-v2",
    schemaVersion: 1,
    sourceUrl: "https://example.com/glove",
    fetchedAt: "2026-06-11T00:00:00.000Z",
    source: {},
    identity: {
      normalizedTitle: makeFieldEvidence("Wizard Test Glove", 0.85, "title"),
      brand: makeFieldEvidence("Proworks", 0.8, "meta"),
    },
    taxonomy: { categorySlug: makeFieldEvidence("disposable_gloves", 0.7, "heuristic") },
    commercePackaging: {
      unitsPerCase: makeFieldEvidence(1000, 0.88, "text"),
      innersPerCase: makeFieldEvidence(10, 0.88, "table"),
      unitsPerInner: makeFieldEvidence(100, 0.88, "table"),
    },
    attributes: {
      material: makeFieldEvidence("nitrile", 0.9, "table"),
    },
    variants: {
      dimensions: [],
      options: [],
      proposedVariants: [],
      unresolvedVariantNotes: [],
    },
    images: {
      candidates: [
        {
          id: "i1",
          url: "https://example.com/p.jpg",
          absoluteUrl: "https://example.com/p.jpg",
          source: "json_ld",
          role: "primary_product",
          score: 0.9,
          confidence: 0.9,
          trust: "trusted",
          reasons: [],
        },
      ],
      primaryCandidateId: "i1",
      rejected: [],
    },
    documents: { specSheetUrls: [], sdsUrls: [], otherUrls: [] },
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
        warnings: [],
      },
      blockers: [],
      warnings: [],
    },
  };
}

describe("ProductSetupWizardPanel", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders from product_setup_contract_summary", () => {
    const summary = buildProductSetupContractSummary(buildProductSetupContractFromExtractionV2(minimalExtraction()));
    render(
      <ProductSetupWizardPanel
        normalizedId="norm-1"
        normalizedData={{ product_setup_contract_summary: summary, normalized_case_cost: 85 }}
        rawPayload={{}}
      />
    );
    expect(screen.getByText("Product setup wizard")).toBeTruthy();
    expect(screen.getByText("Wizard Test Glove")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Apply all safe fields/i })).toBeTruthy();
  });

  it("falls back to _extraction_v2", () => {
    render(
      <ProductSetupWizardPanel
        normalizedData={{
          _extraction_v2: {
            version: "product-url-extraction-v2",
            schemaVersion: 1,
            sourceUrl: "https://example.com/legacy",
            normalizedTitle: "Legacy Fallback Glove",
            imageCandidateCount: 0,
            proposedVariantCount: 0,
            variantDimensions: [],
            confidence: {
              overall: 0.7,
              identity: 0.7,
              variants: 0.5,
              images: 0.5,
              packaging: 0.5,
              attributes: 0.5,
            },
            review: {
              safeToCreateMaster: false,
              safeToStageVariants: false,
              publishReadinessHints: {
                hasVariantCandidates: false,
                hasImageCandidate: false,
                hasPackagingSignal: false,
                hasSkuSourceSeparation: true,
                warnings: [],
              },
              blockers: [],
              warnings: [],
            },
          },
          normalized_case_cost: 50,
        }}
      />
    );
    expect(screen.getByText("Product setup wizard")).toBeTruthy();
    expect(screen.getByText("Legacy Fallback Glove")).toBeTruthy();
  });

  it("shows empty state when no contract exists", () => {
    render(<ProductSetupWizardPanel normalizedData={{}} rawPayload={{}} />);
    expect(screen.getByText(/No product setup contract available/i)).toBeTruthy();
  });

  it("shows enabled apply all when normalizedId and safe fields exist", () => {
    const summary = buildProductSetupContractSummary(buildProductSetupContractFromExtractionV2(minimalExtraction()));
    render(
      <ProductSetupWizardPanel
        normalizedId="norm-1"
        normalizedData={{ product_setup_contract_summary: summary, category_slug: "disposable_gloves" }}
        rawPayload={{}}
      />
    );
    const btn = screen.getByRole("button", { name: /Apply all safe fields/i });
    expect(btn.hasAttribute("disabled")).toBe(false);
  });

  it("shows field-level Apply for safe fields", () => {
    const summary = buildProductSetupContractSummary(buildProductSetupContractFromExtractionV2(minimalExtraction()));
    render(
      <ProductSetupWizardPanel
        normalizedId="norm-1"
        normalizedData={{ product_setup_contract_summary: summary, category_slug: "disposable_gloves" }}
        rawPayload={{}}
      />
    );
    const applyButtons = screen.getAllByRole("button", { name: /^Apply$/i });
    expect(applyButtons.length).toBeGreaterThan(0);
  });

  it("shows apply result after global apply", async () => {
    const summary = buildProductSetupContractSummary(buildProductSetupContractFromExtractionV2(minimalExtraction()));
    const onApplied = vi.fn();
    render(
      <ProductSetupWizardPanel
        normalizedId="norm-1"
        normalizedData={{ product_setup_contract_summary: summary, category_slug: "disposable_gloves" }}
        rawPayload={{}}
        onApplied={onApplied}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Apply all safe fields/i }));
    await waitFor(() => {
      expect(screen.getByText(/Applied 1 field/i)).toBeTruthy();
    });
    expect(applyProductSetupWizardFields).toHaveBeenCalledWith("norm-1", { applyAllSafe: true });
    expect(onApplied).toHaveBeenCalled();
  });
});
