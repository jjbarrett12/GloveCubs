// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { Suspense } from "react";
import { NewFamilyWizardPageClient } from "./NewFamilyWizardPageClient";
import { createEmptyFamilyDraft } from "@/lib/new-product-family/draft";

const navState = vi.hoisted(() => ({
  sp: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navState.replace }),
  useSearchParams: () => navState.sp,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const familyMocks = vi.hoisted(() => ({
  save: vi.fn(),
  load: vi.fn(),
  skus: vi.fn(),
}));

vi.mock("@/app/actions/new-product-family", () => ({
  saveNewProductFamilyDraft: (...a: unknown[]) => familyMocks.save(...a),
  loadNewProductFamilyDraft: (...a: unknown[]) => familyMocks.load(...a),
  listExistingGloveCubsSkus: (...a: unknown[]) => familyMocks.skus(...a),
}));

const brands = [{ id: "b1", name: "ProWorks" }];

function renderWizard() {
  return render(
    <Suspense fallback={null}>
      <NewFamilyWizardPageClient brands={brands} suppliers={[]} />
    </Suspense>
  );
}

describe("NewFamilyWizardPageClient phase 1", () => {
  beforeEach(() => {
    navState.sp = new URLSearchParams();
    navState.replace.mockReset();
    familyMocks.save.mockReset();
    familyMocks.load.mockReset();
    familyMocks.skus.mockReset();
    familyMocks.save.mockResolvedValue({ success: true, batchId: "11111111-1111-4111-8111-111111111111" });
    familyMocks.skus.mockResolvedValue({ success: true, parentSkus: [], variantSkus: [] });
  });
  afterEach(() => cleanup());

  it("does not advance from incomplete identity", async () => {
    renderWizard();
    const next = await screen.findByRole("button", { name: "Next" });
    expect(next).toHaveProperty("disabled", true);
    expect(screen.getByText(/select a brand to continue/i)).toBeTruthy();
  });

  it("advances after identity, then blocks specs without powder", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.type(screen.getByPlaceholderText(/search or create brand/i), "ProWorks");
    await user.click(screen.getByRole("button", { name: "Nitrile" }));
    await user.click(screen.getByRole("button", { name: "Medical / exam" }));
    await user.click(screen.getByRole("button", { name: "Blue-Violet" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText(/Step 2/)).toBeTruthy());
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Select powder status to continue.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Powder-free" }));
    await user.click(screen.getByRole("button", { name: "3 mil" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("saves and restores a family draft with sizes, SKUs, and packaging", async () => {
    const draft = createEmptyFamilyDraft();
    draft.brand = "ProWorks";
    draft.material = "nitrile";
    draft.grade = "medical_exam_grade";
    draft.color = "blue_violet";
    draft.title = "ProWorks Blue-Violet Nitrile Exam Gloves, Powder-Free, 3 mil";
    draft.powder = "powder_free";
    draft.thicknessMil = "3";
    draft.sizes = ["xs", "s", "m", "l", "xl"];
    draft.packaging = { unitsPerInner: 200, innersPerCase: 10 };
    for (const size of draft.sizes) {
      const sku = `GL-N125F-${size.toUpperCase()}`;
      draft.variants[size] = {
        size,
        manufacturerSku: sku,
        supplierSku: sku,
        manufacturerConfirmed: true,
        suggestedManufacturerSku: null,
      };
    }
    navState.sp = new URLSearchParams("batch=11111111-1111-4111-8111-111111111111");
    familyMocks.load.mockResolvedValue({ success: true, draft });
    renderWizard();
    await waitFor(() => expect(screen.getByDisplayValue("ProWorks")).toBeTruthy());
    expect(screen.getByText("XS · S · M · L · XL")).toBeTruthy();
    expect(screen.getByText("2,000 gloves / case")).toBeTruthy();
    expect(familyMocks.load).toHaveBeenCalled();
    expect(JSON.stringify(draft)).not.toMatch(/sell_price/);
  });
});
