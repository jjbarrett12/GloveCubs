// @vitest-environment jsdom

/**
 * Staging smoke: URL import review sheet + table columns (no live staging URL).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { StagedProductDetail } from "./StagedProductDetail";
import { StagingTable } from "./StagingTable";
import type { StagingRow } from "@/lib/review/data";

const reviewActions = vi.hoisted(() => ({
  publishStagedToLive: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default ({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  },
}));

vi.mock("@/app/actions/review", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/app/actions/review")>();
  return {
    ...mod,
    getAttributeRequirementsForStaged: vi.fn().mockResolvedValue({
      success: true,
      required: [],
      stronglyPreferred: [],
      allowedByKey: {},
    }),
    publishStagedToLive: reviewActions.publishStagedToLive,
  };
});

function buildPublishReadiness() {
  return {
    canPublish: true,
    blockers: [] as string[],
    warnings: [] as string[],
    categorySlug: "disposable_gloves",
    categoryRequirementsEnforced: true,
    blockerSections: {
      workflow: [] as string[],
      staging_validation: [] as string[],
      missing_required_attributes: [] as string[],
      case_pricing: [] as string[],
    },
    postClickPipelineNotes: [] as string[],
  };
}

function buildStagingDetail(over: Record<string, unknown> = {}) {
  return {
    id: "norm-smoke-1",
    status: "approved",
    master_product_id: "master-1",
    family_group_key: "fam-key-smoke",
    inferred_size: "L",
    updated_at: "2020-01-01T00:00:00Z",
    master_product: { sku: "M-SKU", name: "Master Name" },
    supplier: { name: "SupplierCo" },
    resolution_candidates: [] as unknown[],
    attributes: { material: "nitrile", size: "L" },
    raw: { raw_payload: {} },
    normalized_data: {
      name: "Norm Name",
      sku: "ROW-SKU",
      supplier_sku: "VAR-99",
      canonical_title: "Canonical Source Title",
      boxes_per_case: 10,
      gloves_per_box: 100,
      total_gloves_per_case: 1000,
      filter_attributes: { material: "nitrile", size: "L" },
      confidence_by_key: { material: 0.9 },
      cost: 10,
    },
    publish_readiness: buildPublishReadiness(),
    ...over,
  };
}

function mockFetchJson(data: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => data,
  });
}

const categories = [{ id: "cat-1", slug: "disposable_gloves", name: "Disposable gloves" }];

describe("URL import review UX smoke", () => {
  beforeEach(() => {
    reviewActions.publishStagedToLive.mockResolvedValue({
      published: true,
      publishComplete: true,
      searchPublishStatus: "published_synced",
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("StagingTable shows source title, variant SKU, and size from normalized_data", () => {
    const row: StagingRow = {
      id: "row-1",
      batch_id: "b1",
      raw_id: "r1",
      supplier_id: "sup-1",
      supplier_name: "Acme",
      normalized_data: {
        sku: "top-sku",
        canonical_title: "Page title from crawl",
        supplier_sku: "variant-sku-xyz",
        name: "Normalized",
      },
      attributes: { size: "XL" },
      match_confidence: 0.9,
      master_product_id: null,
      status: "pending",
      created_at: "2020-01-01T00:00:00Z",
      inferred_size: "M",
    };
    render(<StagingTable rows={[row]} onRowClick={vi.fn()} />);
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Source title" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Variant SKU" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Size" })).toBeTruthy();
    expect(screen.getByText("Page title from crawl")).toBeTruthy();
    expect(screen.getByText("variant-sku-xyz")).toBeTruthy();
    expect(screen.getByText("M")).toBeTruthy();
  });

  it("detail sheet: family strip, step 2, evidence summary, packaging check, single Publish / sync, publish succeeds", async () => {
    const detail = buildStagingDetail();
    mockFetchJson(detail);
    const user = userEvent.setup();
    render(
      <StagedProductDetail normalizedId="norm-smoke-1" open categories={categories} onOpenChange={vi.fn()} />
    );
    await waitFor(() => {
      expect(screen.queryByText("Failed to load.")).toBeNull();
    });
    expect(screen.getByText("Staging family")).toBeTruthy();
    expect(screen.getByText(/Key: fam-key-smoke/)).toBeTruthy();
    expect(screen.getByText("Resolve match")).toBeTruthy();
    expect(screen.getByText("Review flow")).toBeTruthy();
    expect(screen.getAllByText("Publish to live").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Ready to publish when you are/)).toBeTruthy();
    expect(screen.getByText(/fields reviewed/)).toBeTruthy();
    expect(screen.getByText("Packaging check")).toBeTruthy();
    expect(screen.getByText(/Computed:/)).toBeTruthy();
    expect(screen.getByText(/Staged total gloves\/case:/)).toBeTruthy();
    const publishButtons = screen.getAllByRole("button", { name: /Publish \/ sync to live/i });
    expect(publishButtons).toHaveLength(1);
    await user.click(publishButtons[0]);
    await waitFor(() => {
      expect(reviewActions.publishStagedToLive).toHaveBeenCalledWith(
        "norm-smoke-1",
        expect.objectContaining({ publishedBy: "admin" })
      );
    });
    expect(screen.getByText("Published and fully synced.")).toBeTruthy();
  });

  it("detail sheet: step 1 when master not linked", async () => {
    mockFetchJson(
      buildStagingDetail({
        master_product_id: null,
        master_product: undefined,
        status: "pending",
        publish_readiness: { ...buildPublishReadiness(), canPublish: false },
      })
    );
    render(
      <StagedProductDetail normalizedId="norm-step1" open categories={categories} onOpenChange={vi.fn()} />
    );
    await waitFor(() => {
      expect(screen.getByText(/Link this row to a master product/)).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: /Publish \/ sync to live/i })).toBeNull();
  });

  it("detail sheet: no staging family strip when family_group_key empty", async () => {
    mockFetchJson(buildStagingDetail({ family_group_key: null }));
    render(
      <StagedProductDetail normalizedId="norm-nofam" open categories={categories} onOpenChange={vi.fn()} />
    );
    await waitFor(() => {
      expect(screen.getByText(/Ready to publish when you are/)).toBeTruthy();
    });
    expect(screen.queryByText("Staging family")).toBeNull();
  });
});
