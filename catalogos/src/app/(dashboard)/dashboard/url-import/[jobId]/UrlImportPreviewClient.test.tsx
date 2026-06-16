// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import type { UrlImportProductRow } from "@/lib/url-import/admin-data";
import {
  UrlImportPreviewClient,
  formatPreviewV2IndicatorLines,
  previewRowImageUrl,
} from "./UrlImportPreviewClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function validSummary(over: Record<string, unknown> = {}) {
  return {
    version: "product-url-extraction-v2",
    schemaVersion: 1,
    sourceUrl: "https://example.com/glove",
    primaryImageUrl: "https://example.com/v2-primary.jpg",
    imageCandidateCount: 1,
    proposedVariantCount: 5,
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
        hasVariantCandidates: true,
        hasImageCandidate: true,
        hasPackagingSignal: true,
        hasSkuSourceSeparation: true,
        warnings: [],
      },
      blockers: [],
      warnings: [],
    },
    ...over,
  };
}

function productRow(over: Partial<UrlImportProductRow> = {}): UrlImportProductRow {
  return {
    id: "prod-1",
    source_url: "https://example.com/glove",
    raw_payload: null,
    normalized_payload: { name: "Test Glove" },
    extraction_method: "url_extraction_v2",
    confidence: 0.75,
    ai_used: false,
    inferred_base_sku: null,
    inferred_size: null,
    family_group_key: null,
    grouping_confidence: null,
    ...over,
  };
}

describe("formatPreviewV2IndicatorLines", () => {
  it("formats compact V2 hint lines", () => {
    expect(formatPreviewV2IndicatorLines(validSummary() as never)).toEqual([
      "V2 82%",
      "Variants: 5",
      "Create: ok",
      "Stage: review",
    ]);
  });
});

describe("previewRowImageUrl", () => {
  it("prefers legacy image over V2 primaryImageUrl", () => {
    const url = previewRowImageUrl({
      image_url: "https://example.com/legacy.jpg",
      _extraction_v2: validSummary(),
    });
    expect(url).toBe("https://example.com/legacy.jpg");
  });

  it("uses primaryImageUrl when legacy image absent", () => {
    const url = previewRowImageUrl({ _extraction_v2: validSummary() });
    expect(url).toBe("https://example.com/v2-primary.jpg");
  });
});

describe("UrlImportPreviewClient", () => {
  afterEach(() => cleanup());

  it("shows V2 confidence and variant count when _extraction_v2 exists", () => {
    render(
      <UrlImportPreviewClient
        jobId="job-1"
        products={[
          productRow({
            normalized_payload: {
              name: "Test Glove",
              _extraction_v2: validSummary(),
            },
          }),
        ]}
      />
    );
    expect(screen.getByText("V2 82%")).toBeTruthy();
    expect(screen.getByText("Variants: 5")).toBeTruthy();
    expect(screen.getByText("Create: ok")).toBeTruthy();
    expect(screen.getByText("Stage: review")).toBeTruthy();
  });

  it("does not show V2 indicators when _extraction_v2 missing", () => {
    render(
      <UrlImportPreviewClient
        jobId="job-1"
        products={[productRow({ normalized_payload: { name: "Test Glove" } })]}
      />
    );
    expect(screen.queryByText(/^V2 /)).toBeNull();
    expect(screen.queryByText(/^Variants: /)).toBeNull();
  });

  it("uses primaryImageUrl fallback when legacy image absent", () => {
    const { container } = render(
      <UrlImportPreviewClient
        jobId="job-1"
        products={[
          productRow({
            normalized_payload: {
              name: "Test Glove",
              _extraction_v2: validSummary(),
            },
          }),
        ]}
      />
    );
    const img = container.querySelector('img[src="https://example.com/v2-primary.jpg"]');
    expect(img).toBeTruthy();
  });

  it("does not mention safeToPublishVariants", () => {
    render(
      <UrlImportPreviewClient
        jobId="job-1"
        products={[
          productRow({
            normalized_payload: {
              name: "Test Glove",
              _extraction_v2: validSummary(),
            },
          }),
        ]}
      />
    );
    expect(screen.queryByText(/safeToPublishVariants/i)).toBeNull();
  });
});
