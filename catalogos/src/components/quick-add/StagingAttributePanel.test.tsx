// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { StagingAttributePanel } from "./StagingAttributePanel";

const updateNormalizedAttributes = vi.fn();

vi.mock("@/app/actions/review", () => ({
  updateNormalizedAttributes: (...args: unknown[]) => updateNormalizedAttributes(...args),
}));

describe("StagingAttributePanel", () => {
  beforeEach(() => {
    updateNormalizedAttributes.mockReset();
    updateNormalizedAttributes.mockResolvedValue({ success: true });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not fetch staging detail; parent-owned attributes drive the editor", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const user = userEvent.setup();
    const onAfterSave = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();

    render(
      <StagingAttributePanel
        normalizedId="nid-1"
        detailUpdatedAt="2026-01-01T12:00:00.000Z"
        stagingAttributes={{ material: "nitrile" }}
        attributeRequirements={{
          required: ["material"],
          stronglyPreferred: [],
          allowedByKey: { material: ["nitrile", "latex"] },
        }}
        onAfterSave={onAfterSave}
        onError={onError}
      />
    );

    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /save attributes/i }));
    expect(updateNormalizedAttributes).toHaveBeenCalledWith("nid-1", expect.objectContaining({ material: "nitrile" }));
    expect(onAfterSave).toHaveBeenCalled();
  });

  it("shows Applied automatically vs Suggested, not applied without implying sub-threshold keys were merged", () => {
    render(
      <StagingAttributePanel
        normalizedId="nid-2"
        detailUpdatedAt="2026-01-02T12:00:00.000Z"
        stagingAttributes={{ material: "nitrile", color: "blue", brand: "Acme" }}
        facetParseMeta={{
          applied_keys: ["material", "color", "brand"],
          suggested_not_applied: [
            { key: "size", reason: "below_threshold", value: "l" },
            { key: "packaging", reason: "below_threshold", value: "case_1000_ct" },
          ],
          issues: [],
        }}
        attributeRequirements={{
          required: ["material"],
          stronglyPreferred: [],
          allowedByKey: { material: ["nitrile", "latex"] },
        }}
        onAfterSave={vi.fn()}
        onError={vi.fn()}
      />
    );

    expect(screen.getByText(/Applied automatically \(v1\)/i)).toBeTruthy();
    expect(screen.getByText(/Suggested, not applied \(v1\)/i)).toBeTruthy();
    expect(screen.getByText(/size:/i)).toBeTruthy();
    expect(screen.getByText(/packaging:/i)).toBeTruthy();
    expect(screen.queryByText(/Auto-extracted \(v1\)/i)).toBeNull();
  });

  it("renders an editor row for a suggested key that is absent from staged attributes, and save sends that key", async () => {
    const user = userEvent.setup();
    const onAfterSave = vi.fn().mockResolvedValue(undefined);

    render(
      <StagingAttributePanel
        normalizedId="nid-suggested-row"
        detailUpdatedAt="2026-01-04T12:00:00.000Z"
        stagingAttributes={{ material: "nitrile" }}
        facetParseMeta={{
          applied_keys: [],
          suggested_not_applied: [{ key: "size", reason: "below_threshold", value: "l" }],
          issues: [],
        }}
        attributeRequirements={{
          required: ["material"],
          stronglyPreferred: [],
          allowedByKey: { material: ["nitrile", "latex"] },
        }}
        onAfterSave={onAfterSave}
        onError={vi.fn()}
      />
    );

    const editors = screen.getAllByRole("textbox");
    expect(editors).toHaveLength(1);
    await user.type(editors[0], "xl");
    await user.click(screen.getByRole("button", { name: /save attributes/i }));

    expect(updateNormalizedAttributes).toHaveBeenCalledWith(
      "nid-suggested-row",
      expect.objectContaining({ material: "nitrile", size: "xl" })
    );
    expect(onAfterSave).toHaveBeenCalled();
  });

  it("renders an editor row for an applied_keys entry missing from staged attributes", () => {
    render(
      <StagingAttributePanel
        normalizedId="nid-applied-missing"
        detailUpdatedAt="2026-01-05T12:00:00.000Z"
        stagingAttributes={{ material: "nitrile" }}
        facetParseMeta={{
          applied_keys: ["material", "size"],
          suggested_not_applied: [],
          issues: [],
        }}
        attributeRequirements={{
          required: ["material"],
          stronglyPreferred: [],
          allowedByKey: { material: ["nitrile", "latex"] },
        }}
        onAfterSave={vi.fn()}
        onError={vi.fn()}
      />
    );

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("shows refresh hint when extraction summary is empty and hint is enabled", () => {
    render(
      <StagingAttributePanel
        normalizedId="nid-3"
        detailUpdatedAt="2026-01-03T12:00:00.000Z"
        stagingAttributes={{ material: "nitrile" }}
        facetParseMeta={{
          applied_keys: [],
          suggested_not_applied: [],
          issues: [],
          parser_version: "extract_facets_v1",
        }}
        facetExtractionRefreshHint
        attributeRequirements={{
          required: ["material"],
          stronglyPreferred: [],
          allowedByKey: { material: ["nitrile", "latex"] },
        }}
        onAfterSave={vi.fn()}
        onError={vi.fn()}
      />
    );
    expect(
      screen.getByText(/Facet extraction summaries refresh when you save product basics/i)
    ).toBeTruthy();
  });
});
