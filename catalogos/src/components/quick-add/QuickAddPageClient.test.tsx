// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { Suspense } from "react";
import { QuickAddPageClient } from "./QuickAddPageClient";
import { makePublishReadiness, makeStagingDetail, type StagingDetailRow } from "./quick-add-test-fixtures";

const navState = vi.hoisted(() => ({
  sp: new URLSearchParams(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navState.replace, refresh: navState.refresh }),
  useSearchParams: () => navState.sp,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const quickAddMocks = vi.hoisted(() => ({
  createQuickAddDraft: vi.fn(),
  updateQuickAddProductCore: vi.fn(),
}));

vi.mock("@/app/actions/quick-add", () => ({
  createQuickAddDraft: (...a: unknown[]) => quickAddMocks.createQuickAddDraft(...a),
  updateQuickAddProductCore: (...a: unknown[]) => quickAddMocks.updateQuickAddProductCore(...a),
}));

const reviewMocks = vi.hoisted(() => ({
  createNewMasterProduct: vi.fn(),
  publishStagedToLive: vi.fn(),
  getAttributeRequirementsForStaged: vi.fn(),
  updateNormalizedAttributes: vi.fn(),
}));

vi.mock("@/app/actions/review", () => ({
  createNewMasterProduct: (...a: unknown[]) => reviewMocks.createNewMasterProduct(...a),
  publishStagedToLive: (...a: unknown[]) => reviewMocks.publishStagedToLive(...a),
  getAttributeRequirementsForStaged: (...a: unknown[]) => reviewMocks.getAttributeRequirementsForStaged(...a),
  updateNormalizedAttributes: (...a: unknown[]) => reviewMocks.updateNormalizedAttributes(...a),
}));

const suppliers = [{ id: "sup-1", name: "ACME Supply" }];
const categories = [{ id: "cat-1", slug: "disposable_gloves", name: "Disposable gloves" }];

function renderQuickAdd() {
  return render(
    <Suspense fallback={null}>
      <QuickAddPageClient suppliers={suppliers} categories={categories} />
    </Suspense>
  );
}

async function fillCreateDraftForm(user: ReturnType<typeof userEvent.setup>) {
  const basics = screen.getByText("Product basics").closest(".rounded-lg") as HTMLElement;
  const selects = basics.querySelectorAll("select");
  await user.selectOptions(selects[0], "sup-1");
  await user.selectOptions(selects[1], "disposable_gloves");
  const textboxes = within(basics).getAllByRole("textbox");
  await user.clear(textboxes[0]);
  await user.type(textboxes[0], "SKU-99");
  await user.clear(textboxes[1]);
  await user.type(textboxes[1], "Draft glove");
  const costInput = basics.querySelector('input[type="number"]') as HTMLInputElement;
  await user.clear(costInput);
  await user.type(costInput, "12.5");
}

async function clickEnabledPrimaryPublishOrRetry(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => {
    const btns = screen.getAllByRole("button", { name: /publish.*sync.*live|retry publish/i });
    const enabled = btns.find((b) => !(b as HTMLButtonElement).disabled);
    expect(enabled).toBeTruthy();
  });
  const btns = screen.getAllByRole("button", { name: /publish.*sync.*live|retry publish/i });
  const enabled = btns.find((b) => !(b as HTMLButtonElement).disabled) as HTMLButtonElement;
  await user.click(enabled);
}

describe("QuickAddPageClient", () => {
  beforeEach(() => {
    navState.sp = new URLSearchParams();
    navState.replace.mockReset();
    navState.refresh.mockReset();
    quickAddMocks.createQuickAddDraft.mockReset();
    quickAddMocks.updateQuickAddProductCore.mockReset();
    reviewMocks.createNewMasterProduct.mockReset();
    reviewMocks.publishStagedToLive.mockReset();
    reviewMocks.getAttributeRequirementsForStaged.mockReset();
    reviewMocks.updateNormalizedAttributes.mockReset();
    reviewMocks.getAttributeRequirementsForStaged.mockResolvedValue({
      success: true,
      required: [],
      stronglyPreferred: [],
      allowedByKey: {},
    });
    reviewMocks.updateNormalizedAttributes.mockResolvedValue({ success: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (String(url).includes("/api/review/staging/")) {
          const row = (globalThis as unknown as { __qa_fetch_row?: StagingDetailRow }).__qa_fetch_row;
          return { ok: true, json: async () => row ?? makeStagingDetail("nid-1") };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete (globalThis as unknown as { __qa_fetch_row?: StagingDetailRow }).__qa_fetch_row;
    vi.clearAllMocks();
  });

  function setStagingFetchRow(row: StagingDetailRow) {
    (globalThis as unknown as { __qa_fetch_row: StagingDetailRow }).__qa_fetch_row = row;
  }

  it("create draft: shell submit calls createQuickAddDraft once and navigates with ?id=", async () => {
    const user = userEvent.setup();
    quickAddMocks.createQuickAddDraft.mockResolvedValue({ success: true, normalizedId: "new-nid" });

    renderQuickAdd();

    await fillCreateDraftForm(user);

    await user.click(screen.getByRole("button", { name: /create draft/i }));

    await waitFor(() => {
      expect(quickAddMocks.createQuickAddDraft).toHaveBeenCalledTimes(1);
    });
    expect(quickAddMocks.createQuickAddDraft).toHaveBeenCalledWith({
      supplier_id: "sup-1",
      sku: "SKU-99",
      name: "Draft glove",
      category_slug: "disposable_gloves",
      normalized_case_cost: 12.5,
    });
    expect(navState.replace).toHaveBeenCalledWith(expect.stringContaining("id=new-nid"));
  });

  it("load with ?id= refetches staging and does not create another draft", async () => {
    navState.sp = new URLSearchParams("id=existing-nid");
    setStagingFetchRow(makeStagingDetail("existing-nid", { master_product_id: "m1", status: "approved" }));

    renderQuickAdd();

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const stagingUrlCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/api/review/staging/existing-nid"));
    expect(stagingUrlCalls.length).toBeGreaterThanOrEqual(1);
    expect(quickAddMocks.createQuickAddDraft).not.toHaveBeenCalled();
  });

  it("remount with ?id= refetches again but never creates a draft", async () => {
    navState.sp = new URLSearchParams("id=existing-nid");
    setStagingFetchRow(makeStagingDetail("existing-nid", { master_product_id: "m1", status: "approved" }));

    const { unmount } = renderQuickAdd();
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    const callsAfterFirst = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    unmount();
    cleanup();

    renderQuickAdd();
    await waitFor(() => {
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });
    expect(quickAddMocks.createQuickAddDraft).not.toHaveBeenCalled();
  });

  it("after basics save, refetches staging so Tier 1 panel reflects server readiness", async () => {
    const user = userEvent.setup();
    navState.sp = new URLSearchParams("id=nid-1");

    const rowBlocked = makeStagingDetail("nid-1", {
      master_product_id: "m1",
      status: "approved",
      publish_readiness: makePublishReadiness({
        canPublish: false,
        blockerSections: {
          workflow: [],
          staging_validation: ["Row has validation_errors; fix or clear before publish."],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });
    const rowReady = makeStagingDetail("nid-1", {
      master_product_id: "m1",
      status: "approved",
      updated_at: "2026-01-01T13:00:00.000Z",
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });

    let fetchCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (String(url).includes("/api/review/staging/")) {
          fetchCount += 1;
          const row = fetchCount === 1 ? rowBlocked : rowReady;
          return { ok: true, json: async () => row };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      })
    );

    quickAddMocks.updateQuickAddProductCore.mockResolvedValue({ success: true });

    renderQuickAdd();

    const readinessCard = await waitFor(() => {
      const heading = screen.getByText("Publish readiness");
      const card = heading.closest(".rounded-lg");
      expect(card).toBeTruthy();
      return card as HTMLElement;
    });
    expect(within(readinessCard).getByText(/Preflight blocked/i)).toBeTruthy();

    const basicsCard = screen.getByText("Product basics").closest(".rounded-lg");
    expect(basicsCard).toBeTruthy();
    const basics = within(basicsCard as HTMLElement);
    await user.click(basics.getByRole("button", { name: /save basics/i }));

    await waitFor(() => {
      expect(quickAddMocks.updateQuickAddProductCore).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(within(readinessCard).getByText(/Tier 1: Ready for publish attempt/i)).toBeTruthy();
    });
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("after create master, refetches staging so Tier 1 reflects server truth", async () => {
    const user = userEvent.setup();
    navState.sp = new URLSearchParams("id=nid-1");

    const pendingNoMaster = makeStagingDetail("nid-1", {
      master_product_id: null,
      status: "pending",
      publish_readiness: makePublishReadiness({
        canPublish: false,
        blockerSections: {
          workflow: ["Status must be approved or merged (current: pending)", "Link a master product"],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });
    const approvedWithMaster = makeStagingDetail("nid-1", {
      master_product_id: "m1",
      status: "approved",
      updated_at: "2026-01-01T14:00:00.000Z",
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });

    let fetchCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (String(url).includes("/api/review/staging/")) {
          fetchCount += 1;
          const row = fetchCount === 1 ? pendingNoMaster : approvedWithMaster;
          return { ok: true, json: async () => row };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      })
    );

    reviewMocks.createNewMasterProduct.mockResolvedValue({ success: true, masterProductId: "m1" });

    renderQuickAdd();

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /create product record/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
    await user.click(screen.getByRole("button", { name: /create product record/i }));

    await waitFor(() => {
      expect(reviewMocks.createNewMasterProduct).toHaveBeenCalledTimes(1);
    });
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    await waitFor(() => {
      expect(screen.getByText(/Master linked/i)).toBeTruthy();
    });
    const readinessHeading = screen.getByText("Publish readiness");
    const readinessCard = readinessHeading.closest(".rounded-lg") as HTMLElement;
    await waitFor(() => {
      expect(within(readinessCard).getByText(/Tier 1: Ready for publish attempt/i)).toBeTruthy();
    });
  });

  it("after attributes save, refetches staging detail from GET /api/review/staging/:id", async () => {
    const user = userEvent.setup();
    navState.sp = new URLSearchParams("id=nid-1");

    reviewMocks.getAttributeRequirementsForStaged.mockResolvedValue({
      success: true,
      required: ["brand"],
      stronglyPreferred: [],
      allowedByKey: { brand: ["AcmeBrand", "BetaBrand"] },
    });

    const rowBefore = makeStagingDetail("nid-1", {
      master_product_id: "m1",
      status: "approved",
      attributes: {},
      updated_at: "2026-01-01T12:00:00.000Z",
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });
    const rowAfter = makeStagingDetail("nid-1", {
      master_product_id: "m1",
      status: "approved",
      attributes: { brand: "AcmeBrand" },
      updated_at: "2026-01-01T15:00:00.000Z",
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });

    let fetchCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (String(url).includes("/api/review/staging/")) {
          fetchCount += 1;
          const row = fetchCount === 1 ? rowBefore : rowAfter;
          return { ok: true, json: async () => row };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      })
    );

    renderQuickAdd();

    const merchCard = await waitFor(() => {
      const h = screen.getByText("Merchandising attributes");
      const card = h.closest(".rounded-lg");
      expect(card).toBeTruthy();
      return card as HTMLElement;
    });
    const brandSelect = within(merchCard).getByRole("combobox") as HTMLSelectElement;
    await user.selectOptions(brandSelect, "AcmeBrand");
    await user.click(screen.getByRole("button", { name: /save attributes/i }));

    await waitFor(() => {
      expect(reviewMocks.updateNormalizedAttributes).toHaveBeenCalledWith("nid-1", expect.objectContaining({ brand: "AcmeBrand" }));
    });
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    await waitFor(() => {
      const card = screen.getByText("Merchandising attributes").closest(".rounded-lg") as HTMLElement;
      expect((within(card).getByRole("combobox") as HTMLSelectElement).value).toBe("AcmeBrand");
    });
  });

  it("stale attribute-save failure for row A does not set error banner on row B after ?id= switch", async () => {
    const user = userEvent.setup();
    navState.sp = new URLSearchParams("id=nid-a");

    const ndBase = {
      category_slug: "disposable_gloves",
      filter_attributes: {},
      normalized_case_cost: 10,
      pricing: { sell_unit: "case", normalized_case_cost: 10 },
    };
    const rowA = makeStagingDetail("nid-a", {
      master_product_id: "m1",
      status: "approved",
      normalized_data: { ...ndBase, name: "ROW-ATTR-A", supplier_sku: "SA", sku: "SA" },
      attributes: {},
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });
    const rowB = makeStagingDetail("nid-b", {
      master_product_id: "m2",
      status: "approved",
      normalized_data: { ...ndBase, name: "ROW-ATTR-B", supplier_sku: "SB", sku: "SB" },
      attributes: {},
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });

    reviewMocks.getAttributeRequirementsForStaged.mockResolvedValue({
      success: true,
      required: ["brand"],
      stronglyPreferred: [],
      allowedByKey: { brand: ["AcmeBrand", "BetaBrand"] },
    });

    let releaseA: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = () => resolve();
    });

    reviewMocks.updateNormalizedAttributes.mockImplementation(async (normalizedId: string) => {
      if (normalizedId === "nid-a") await gateA;
      return { success: false, error: "ATTR-ERR-ROW-A-ONLY" };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (String(url).includes("/api/review/staging/nid-a")) return { ok: true, json: async () => rowA };
        if (String(url).includes("/api/review/staging/nid-b")) return { ok: true, json: async () => rowB };
        return { ok: false, status: 404, json: async () => ({}) };
      })
    );

    const view = render(
      <Suspense fallback={null}>
        <QuickAddPageClient suppliers={suppliers} categories={categories} />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("ROW-ATTR-A")).toBeTruthy();
    });
    const merchA = await waitFor(() => {
      const h = screen.getByText("Merchandising attributes");
      const card = h.closest(".rounded-lg");
      expect(card).toBeTruthy();
      return card as HTMLElement;
    });
    await user.selectOptions(within(merchA).getByRole("combobox"), "AcmeBrand");
    await user.click(screen.getByRole("button", { name: /save attributes/i }));

    navState.sp = new URLSearchParams("id=nid-b");
    view.rerender(
      <Suspense fallback={null}>
        <QuickAddPageClient suppliers={suppliers} categories={categories} />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("ROW-ATTR-B")).toBeTruthy();
    });

    releaseA();
    await new Promise((r) => setTimeout(r, 60));

    expect(screen.queryByText(/ATTR-ERR-ROW-A-ONLY/i)).toBeNull();
  });

  it("publish failure shows PublishFailureBanner, Retry publish label, and refetches staging", async () => {
    const user = userEvent.setup();
    navState.sp = new URLSearchParams("id=nid-1");

    const row = makeStagingDetail("nid-1", {
      master_product_id: "m1",
      status: "approved",
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });
    setStagingFetchRow(row);

    reviewMocks.publishStagedToLive.mockResolvedValueOnce({
      success: false,
      published: false,
      error: "product_attributes sync failed: conflict",
      publishError: "product_attributes sync failed: conflict",
    });

    renderQuickAdd();

    await waitFor(() => {
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
    });
    const fetchBeforeFail = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    await clickEnabledPrimaryPublishOrRetry(user);

    await waitFor(() => {
      expect(screen.getByText(/Publish did not complete/i)).toBeTruthy();
    });
    expect(screen.getByText(/Failure stage:/i)).toBeTruthy();
    expect(screen.getByText(/Canonical product_attributes sync/i)).toBeTruthy();
    const retryBtns = screen.getAllByRole("button", { name: /retry publish/i });
    const enabledRetry = retryBtns.find((b) => !(b as HTMLButtonElement).disabled);
    expect(enabledRetry).toBeTruthy();
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(fetchBeforeFail);
    expect(reviewMocks.publishStagedToLive).toHaveBeenCalledTimes(1);
  });

  it("changing ?id= clears publish failure; primary action is Publish for the new row", async () => {
    const user = userEvent.setup();
    navState.sp = new URLSearchParams("id=nid-a");

    const rowA = makeStagingDetail("nid-a", {
      master_product_id: "m1",
      status: "approved",
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });
    const rowB = makeStagingDetail("nid-b", {
      master_product_id: "m2",
      status: "approved",
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (String(url).includes("/api/review/staging/nid-a")) return { ok: true, json: async () => rowA };
        if (String(url).includes("/api/review/staging/nid-b")) return { ok: true, json: async () => rowB };
        return { ok: false, status: 404, json: async () => ({}) };
      })
    );

    reviewMocks.publishStagedToLive.mockResolvedValue({
      success: false,
      published: false,
      error: "fail-from-row-a",
      publishError: "fail-from-row-a",
    });

    const view = render(
      <Suspense fallback={null}>
        <QuickAddPageClient suppliers={suppliers} categories={categories} />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByText("nid-a")).toBeTruthy();
    });
    await clickEnabledPrimaryPublishOrRetry(user);
    await waitFor(() => {
      expect(screen.getByText(/Publish did not complete/i)).toBeTruthy();
    });

    navState.sp = new URLSearchParams("id=nid-b");
    view.rerender(
      <Suspense fallback={null}>
        <QuickAddPageClient suppliers={suppliers} categories={categories} />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.queryByText(/Publish did not complete/i)).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByText("nid-b")).toBeTruthy();
    });
    const publishBtns = screen.getAllByRole("button", { name: /publish.*sync.*live/i });
    const enabledPublish = publishBtns.find((b) => !(b as HTMLButtonElement).disabled);
    expect(enabledPublish).toBeTruthy();
    expect(enabledPublish?.textContent).toMatch(/publish.*sync.*live/i);
    expect(enabledPublish?.textContent).not.toMatch(/retry publish/i);
  });

  it("changing ?id= clears row detail until the new staging fetch completes (no stale A under B)", async () => {
    navState.sp = new URLSearchParams("id=nid-a");

    const ndA = {
      name: "QUICKADD-ROW-A",
      supplier_sku: "SA",
      sku: "SA",
      category_slug: "disposable_gloves",
      filter_attributes: {},
      normalized_case_cost: 10,
      pricing: { sell_unit: "case", normalized_case_cost: 10 },
    };
    const ndB = {
      name: "QUICKADD-ROW-B",
      supplier_sku: "SB",
      sku: "SB",
      category_slug: "disposable_gloves",
      filter_attributes: {},
      normalized_case_cost: 11,
      pricing: { sell_unit: "case", normalized_case_cost: 11 },
    };
    const rowA = makeStagingDetail("nid-a", {
      master_product_id: "m1",
      status: "approved",
      normalized_data: ndA,
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });
    const rowB = makeStagingDetail("nid-b", {
      master_product_id: "m2",
      status: "approved",
      normalized_data: ndB,
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });

    let releaseB: () => void;
    const gateB = new Promise<void>((resolve) => {
      releaseB = () => resolve();
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (String(url).includes("/api/review/staging/nid-a")) {
          return { ok: true, json: async () => rowA };
        }
        if (String(url).includes("/api/review/staging/nid-b")) {
          await gateB;
          return { ok: true, json: async () => rowB };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      })
    );

    const view = render(
      <Suspense fallback={null}>
        <QuickAddPageClient suppliers={suppliers} categories={categories} />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("QUICKADD-ROW-A")).toBeTruthy();
    });

    navState.sp = new URLSearchParams("id=nid-b");
    view.rerender(
      <Suspense fallback={null}>
        <QuickAddPageClient suppliers={suppliers} categories={categories} />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.queryByDisplayValue("QUICKADD-ROW-A")).toBeNull();
    });
    expect(screen.getByText("nid-b")).toBeTruthy();
    expect(screen.getByText(/Loading/i)).toBeTruthy();

    releaseB();
    await waitFor(() => {
      expect(screen.getByDisplayValue("QUICKADD-ROW-B")).toBeTruthy();
    });
    expect(screen.queryByDisplayValue("QUICKADD-ROW-A")).toBeNull();
  });

  it("stale staging fetch for a previous id cannot overwrite detail after switching ?id=", async () => {
    navState.sp = new URLSearchParams("id=nid-a");

    const ndA = {
      name: "STALE-A-WINS-IF-APPLIED",
      supplier_sku: "SA",
      sku: "SA",
      category_slug: "disposable_gloves",
      filter_attributes: {},
      normalized_case_cost: 10,
      pricing: { sell_unit: "case", normalized_case_cost: 10 },
    };
    const ndB = {
      name: "STALE-B-CORRECT",
      supplier_sku: "SB",
      sku: "SB",
      category_slug: "disposable_gloves",
      filter_attributes: {},
      normalized_case_cost: 11,
      pricing: { sell_unit: "case", normalized_case_cost: 11 },
    };
    const rowA = makeStagingDetail("nid-a", {
      master_product_id: "m1",
      status: "approved",
      normalized_data: ndA,
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });
    const rowB = makeStagingDetail("nid-b", {
      master_product_id: "m2",
      status: "approved",
      normalized_data: ndB,
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });

    let releaseA: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = () => resolve();
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (String(url).includes("/api/review/staging/nid-a")) {
          await gateA;
          return { ok: true, json: async () => rowA };
        }
        if (String(url).includes("/api/review/staging/nid-b")) {
          return { ok: true, json: async () => rowB };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      })
    );

    const view = render(
      <Suspense fallback={null}>
        <QuickAddPageClient suppliers={suppliers} categories={categories} />
      </Suspense>
    );

    await waitFor(() => {
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0]).includes("nid-a"))).toBeTruthy();
    });

    navState.sp = new URLSearchParams("id=nid-b");
    view.rerender(
      <Suspense fallback={null}>
        <QuickAddPageClient suppliers={suppliers} categories={categories} />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("STALE-B-CORRECT")).toBeTruthy();
    });

    releaseA();
    await new Promise((r) => setTimeout(r, 30));

    expect(screen.getByDisplayValue("STALE-B-CORRECT")).toBeTruthy();
    expect(screen.queryByDisplayValue("STALE-A-WINS-IF-APPLIED")).toBeNull();
  });

  it("stale publish completion for row A does not apply failure UI after switching to row B", async () => {
    const user = userEvent.setup();
    navState.sp = new URLSearchParams("id=nid-a");

    const ndA = {
      name: "ROW-PUB-A",
      supplier_sku: "SA",
      sku: "SA",
      category_slug: "disposable_gloves",
      filter_attributes: {},
      normalized_case_cost: 10,
      pricing: { sell_unit: "case", normalized_case_cost: 10 },
    };
    const ndB = {
      name: "ROW-PUB-B",
      supplier_sku: "SB",
      sku: "SB",
      category_slug: "disposable_gloves",
      filter_attributes: {},
      normalized_case_cost: 10,
      pricing: { sell_unit: "case", normalized_case_cost: 10 },
    };
    const rowA = makeStagingDetail("nid-a", {
      master_product_id: "m1",
      status: "approved",
      normalized_data: ndA,
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });
    const rowB = makeStagingDetail("nid-b", {
      master_product_id: "m2",
      status: "approved",
      normalized_data: ndB,
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });

    let releaseA: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = () => resolve();
    });

    reviewMocks.publishStagedToLive.mockImplementation(async (normalizedId: string) => {
      if (normalizedId === "nid-a") await gateA;
      return { success: false, published: false, publishError: "STALE-PUB-FAIL-A", error: "STALE-PUB-FAIL-A" };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (String(url).includes("/api/review/staging/nid-a")) return { ok: true, json: async () => rowA };
        if (String(url).includes("/api/review/staging/nid-b")) return { ok: true, json: async () => rowB };
        return { ok: false, status: 404, json: async () => ({}) };
      })
    );

    const view = render(
      <Suspense fallback={null}>
        <QuickAddPageClient suppliers={suppliers} categories={categories} />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("ROW-PUB-A")).toBeTruthy();
    });
    await clickEnabledPrimaryPublishOrRetry(user);

    navState.sp = new URLSearchParams("id=nid-b");
    view.rerender(
      <Suspense fallback={null}>
        <QuickAddPageClient suppliers={suppliers} categories={categories} />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("ROW-PUB-B")).toBeTruthy();
    });

    releaseA();
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByText(/Publish did not complete/i)).toBeNull();
    expect(screen.queryByText(/STALE-PUB-FAIL-A/i)).toBeNull();
    expect(screen.getByDisplayValue("ROW-PUB-B")).toBeTruthy();
  });

  it("stale create-master completion for row A does not show success banner on row B", async () => {
    const user = userEvent.setup();
    navState.sp = new URLSearchParams("id=nid-a");

    const rowA = makeStagingDetail("nid-a", {
      master_product_id: null,
      status: "pending",
      normalized_data: {
        name: "ROW-MASTER-A",
        supplier_sku: "SA",
        sku: "SA",
        category_slug: "disposable_gloves",
        filter_attributes: {},
        normalized_case_cost: 10,
        pricing: { sell_unit: "case", normalized_case_cost: 10 },
      },
      publish_readiness: makePublishReadiness({
        canPublish: false,
        blockerSections: {
          workflow: ["pending"],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });
    const rowB = makeStagingDetail("nid-b", {
      master_product_id: null,
      status: "pending",
      normalized_data: {
        name: "ROW-MASTER-B",
        supplier_sku: "SB",
        sku: "SB",
        category_slug: "disposable_gloves",
        filter_attributes: {},
        normalized_case_cost: 10,
        pricing: { sell_unit: "case", normalized_case_cost: 10 },
      },
      publish_readiness: makePublishReadiness({
        canPublish: false,
        blockerSections: {
          workflow: ["pending"],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });

    let releaseA: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = () => resolve();
    });

    reviewMocks.createNewMasterProduct.mockImplementation(async (normalizedId: string) => {
      if (normalizedId === "nid-a") await gateA;
      return { success: true, masterProductId: "m1", published: false };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (String(url).includes("/api/review/staging/nid-a")) return { ok: true, json: async () => rowA };
        if (String(url).includes("/api/review/staging/nid-b")) return { ok: true, json: async () => rowB };
        return { ok: false, status: 404, json: async () => ({}) };
      })
    );

    const view = render(
      <Suspense fallback={null}>
        <QuickAddPageClient suppliers={suppliers} categories={categories} />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("ROW-MASTER-A")).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: /create product record/i }));

    navState.sp = new URLSearchParams("id=nid-b");
    view.rerender(
      <Suspense fallback={null}>
        <QuickAddPageClient suppliers={suppliers} categories={categories} />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("ROW-MASTER-B")).toBeTruthy();
    });

    releaseA();
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByText(/Product record created and staging approved/i)).toBeNull();
    expect(screen.getByDisplayValue("ROW-MASTER-B")).toBeTruthy();
    expect(screen.getByRole("button", { name: /create product record/i })).toBeTruthy();
  });

  it("id change clears actionBusy so row B is not stuck in Publishing from row A", async () => {
    const user = userEvent.setup();
    navState.sp = new URLSearchParams("id=nid-a");

    const ndA = {
      name: "ROW-BUSY-A",
      supplier_sku: "SA",
      sku: "SA",
      category_slug: "disposable_gloves",
      filter_attributes: {},
      normalized_case_cost: 10,
      pricing: { sell_unit: "case", normalized_case_cost: 10 },
    };
    const ndB = {
      name: "ROW-BUSY-B",
      supplier_sku: "SB",
      sku: "SB",
      category_slug: "disposable_gloves",
      filter_attributes: {},
      normalized_case_cost: 10,
      pricing: { sell_unit: "case", normalized_case_cost: 10 },
    };
    const rowA = makeStagingDetail("nid-a", {
      master_product_id: "m1",
      status: "approved",
      normalized_data: ndA,
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });
    const rowB = makeStagingDetail("nid-b", {
      master_product_id: "m2",
      status: "approved",
      normalized_data: ndB,
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });

    reviewMocks.publishStagedToLive.mockImplementation(async (normalizedId: string) => {
      if (normalizedId === "nid-a") await new Promise(() => {});
      return {
        success: true,
        published: true,
        publishComplete: true,
        searchPublishStatus: "published_synced",
      };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (String(url).includes("/api/review/staging/nid-a")) return { ok: true, json: async () => rowA };
        if (String(url).includes("/api/review/staging/nid-b")) return { ok: true, json: async () => rowB };
        return { ok: false, status: 404, json: async () => ({}) };
      })
    );

    const view = render(
      <Suspense fallback={null}>
        <QuickAddPageClient suppliers={suppliers} categories={categories} />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("ROW-BUSY-A")).toBeTruthy();
    });
    await clickEnabledPrimaryPublishOrRetry(user);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^publishing/i })).toBeTruthy();
    });

    navState.sp = new URLSearchParams("id=nid-b");
    view.rerender(
      <Suspense fallback={null}>
        <QuickAddPageClient suppliers={suppliers} categories={categories} />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("ROW-BUSY-B")).toBeTruthy();
    });

    const publishBtns = screen.getAllByRole("button", { name: /publish.*sync.*live|retry publish/i });
    const enabled = publishBtns.find((b) => !(b as HTMLButtonElement).disabled) as HTMLButtonElement;
    expect(enabled).toBeTruthy();
    expect(enabled.textContent).not.toMatch(/^publishing/i);
  });

  it("publish success shows Tier 2 copy and clears publish failure UI", async () => {
    const user = userEvent.setup();
    navState.sp = new URLSearchParams("id=nid-1");

    const row = makeStagingDetail("nid-1", {
      master_product_id: "m1",
      status: "approved",
      publish_readiness: makePublishReadiness({
        canPublish: true,
        blockerSections: {
          workflow: [],
          staging_validation: [],
          missing_required_attributes: [],
          case_pricing: [],
        },
      }),
    });
    setStagingFetchRow(row);

    reviewMocks.publishStagedToLive
      .mockResolvedValueOnce({
        success: false,
        published: false,
        error: "product_attributes sync failed: conflict",
        publishError: "product_attributes sync failed: conflict",
      })
      .mockResolvedValueOnce({
        success: true,
        published: true,
        publishComplete: true,
        searchPublishStatus: "published_synced",
      });

    renderQuickAdd();

    await clickEnabledPrimaryPublishOrRetry(user);

    await waitFor(() => {
      expect(screen.getByText(/Publish did not complete/i)).toBeTruthy();
    });
    expect(screen.getByText(/Failure stage:/i)).toBeTruthy();
    expect(screen.getByText(/Canonical product_attributes sync/i)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /retry publish/i }).length).toBeGreaterThanOrEqual(1);

    const fetchCallsAfterFail = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    await clickEnabledPrimaryPublishOrRetry(user);

    await waitFor(() => {
      expect(reviewMocks.publishStagedToLive).toHaveBeenCalledTimes(2);
    });
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(fetchCallsAfterFail);

    await waitFor(() => {
      expect(screen.queryByText(/Publish did not complete/i)).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByText(/Published and fully synced/i)).toBeTruthy();
    });
  });
});
