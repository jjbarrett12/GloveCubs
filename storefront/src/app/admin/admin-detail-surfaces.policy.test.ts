import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ADMIN_DIR = join(__dirname);
const COMPONENTS_DIR = join(__dirname, "../../components/admin");

function readAdmin(rel: string): string {
  return readFileSync(join(ADMIN_DIR, rel), "utf8");
}

function readComponent(rel: string): string {
  return readFileSync(join(COMPONENTS_DIR, rel), "utf8");
}

const PHASE_6C_FILES: { path: string; read: () => string }[] = [
  { path: "orders/[orderId]/page.tsx", read: () => readAdmin("orders/[orderId]/page.tsx") },
  { path: "orders/[orderId]/OrderOperatorActions.tsx", read: () => readAdmin("orders/[orderId]/OrderOperatorActions.tsx") },
  { path: "companies/[companyId]/page.tsx", read: () => readAdmin("companies/[companyId]/page.tsx") },
  { path: "companies/page.tsx", read: () => readAdmin("companies/page.tsx") },
  { path: "companies/new/page.tsx", read: () => readAdmin("companies/new/page.tsx") },
  { path: "companies/CompaniesDirectoryClient.tsx", read: () => readAdmin("companies/CompaniesDirectoryClient.tsx") },
  { path: "companies/CompanyProfileForm.tsx", read: () => readAdmin("companies/CompanyProfileForm.tsx") },
  { path: "companies/CompanyCreateForm.tsx", read: () => readAdmin("companies/CompanyCreateForm.tsx") },
  { path: "companies/CompanyB2bTierSelect.tsx", read: () => readAdmin("companies/CompanyB2bTierSelect.tsx") },
  { path: "companies/CompanyQuicklistManager.tsx", read: () => readAdmin("companies/CompanyQuicklistManager.tsx") },
  { path: "companies/CompanyShipToAddressesManager.tsx", read: () => readAdmin("companies/CompanyShipToAddressesManager.tsx") },
  { path: "components/admin/SlideOver.tsx", read: () => readComponent("SlideOver.tsx") },
  { path: "components/admin/OnboardingCard.tsx", read: () => readComponent("OnboardingCard.tsx") },
  { path: "components/admin/SetupChecklist.tsx", read: () => readComponent("SetupChecklist.tsx") },
  { path: "components/admin/CustomerDetailHeader.tsx", read: () => readComponent("CustomerDetailHeader.tsx") },
  { path: "components/admin/CustomerDetailMetrics.tsx", read: () => readComponent("CustomerDetailMetrics.tsx") },
  { path: "components/admin/CustomerDetailTabNav.tsx", read: () => readComponent("CustomerDetailTabNav.tsx") },
  { path: "components/admin/CustomerAccountCard.tsx", read: () => readComponent("CustomerAccountCard.tsx") },
  { path: "components/admin/DetailTableShell.tsx", read: () => readComponent("DetailTableShell.tsx") },
];

const BANNED_LIGHT_PATTERNS = [
  /\bbg-white\b/,
  /\bbg-slate-50\b/,
  /\bborder-slate-200\b/,
  /\btext-gray-500\b/,
  /\bbg-red-50\b/,
  /\bbg-yellow-50\b/,
  /\bbg-green-50\b/,
  /\bbg-amber-50\b/,
  /\bbg-emerald-50\b/,
];

describe("Admin Phase 6C detail surfaces", () => {
  for (const file of PHASE_6C_FILES) {
    it(`${file.path} avoids banned light-only surface patterns`, () => {
      const s = file.read();
      for (const pattern of BANNED_LIGHT_PATTERNS) {
        expect(s, `${file.path} ${String(pattern)}`).not.toMatch(pattern);
      }
    });
  }

  it("order detail links to order records list", () => {
    const page = readAdmin("orders/[orderId]/page.tsx");
    expect(page).toContain("/admin/orders");
  });

  it("company detail links to customers and orders", () => {
    const page = readAdmin("companies/[companyId]/page.tsx");
    expect(page).toContain("/admin/companies");
    expect(page).toContain("/admin/orders");
  });

  it("company new page links back to customer accounts", () => {
    const page = readAdmin("companies/new/page.tsx");
    expect(page).toContain("/admin/companies");
  });

  it("detail surfaces do not expose JWT_SECRET or NEXT_PUBLIC_GLOVECUBS_API", () => {
    for (const file of PHASE_6C_FILES) {
      const s = file.read();
      expect(s, file.path).not.toContain("JWT_SECRET");
      expect(s, file.path).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
    }
  });

  it("order detail uses tokenized section cards and line items table", () => {
    const page = readAdmin("orders/[orderId]/page.tsx");
    expect(page).toContain("PremiumSectionCard");
    expect(page).toContain("DetailTableShell");
    expect(page).toContain("ErrorState");
    expect(page).toContain("StatusBadge");
  });

  it("SlideOver uses admin surface tokens", () => {
    const slide = readComponent("SlideOver.tsx");
    expect(slide).toContain("bg-admin-surface");
    expect(slide).toContain("border-admin-border");
    expect(slide).toContain("text-admin-primary");
  });
});
