import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ADMIN_DIR = join(__dirname);

function read(rel: string): string {
  return readFileSync(join(ADMIN_DIR, rel), "utf8");
}

const FAKE_METRIC_PATTERNS = [
  /\brevenue\b/i,
  /\bmargin\b/i,
  /\bsavings\b/i,
  /\bGMV\b/,
  /\bfake\b/i,
  /\bplaceholder metric/i,
];

const SECRET_PATTERNS = ["JWT_SECRET", "NEXT_PUBLIC_GLOVECUBS_API"];

describe("Admin dashboard V2 command center", () => {
  it('renders "Command center" title', () => {
    const page = read("page.tsx");
    expect(page).toContain("Command center");
    expect(page).toContain('title="Command center"');
  });

  it("uses fetchAdminHomeSnapshot for real operational data", () => {
    const page = read("page.tsx");
    expect(page).toContain("fetchAdminHomeSnapshot");
    expect(page).toContain("snap.quoteRequestCount");
    expect(page).toContain("snap.opportunityCount");
    expect(page).toContain("snap.recentQuoteRequests");
    expect(page).toContain("snap.canonicalOrdersCount");
    expect(page).toContain("snap.companiesCount");
  });

  it("does not introduce hardcoded fake revenue/margin/savings claims", () => {
    const page = read("page.tsx");
    for (const pattern of FAKE_METRIC_PATTERNS) {
      expect(page, String(pattern)).not.toMatch(pattern);
    }
  });

  it("does not render raw JWT_SECRET or NEXT_PUBLIC_GLOVECUBS_API", () => {
    const files = ["page.tsx", "_components/AdminQueueCard.tsx", "_components/AdminRecentQuotesTable.tsx"];
    for (const file of files) {
      const s = read(file);
      for (const secret of SECRET_PATTERNS) {
        expect(s, file).not.toContain(secret);
      }
    }
  });

  it("shows Admin Health integration via resolveAdminHealth and settings link", () => {
    const page = read("page.tsx");
    expect(page).toContain("resolveAdminHealth");
    expect(page).toContain("/admin/settings#health");
    expect(page).toContain("AdminHealthBanner");
    expect(page).toContain("getAdminModuleAvailability");
  });

  it("links to key operator modules", () => {
    const page = read("page.tsx");
    expect(page).toContain('href="/admin/leads"');
    expect(page).toContain('href="/admin/opportunities"');
    expect(page).toContain('href="/admin/products"');
    expect(page).toContain('href="/admin/companies"');
  });

  it("uses EmptyState when recent quote list is empty", () => {
    const page = read("page.tsx");
    expect(page).toContain("snap.recentQuoteRequests.length === 0");
    expect(page).toContain("EmptyState");
    expect(page).toContain("No quote requests yet");
  });

  it("uses tokenized shared components for tables and queues", () => {
    const page = read("page.tsx");
    expect(page).toContain("AdminQueueCard");
    expect(page).toContain("AdminRecentQuotesTable");
    expect(page).toContain("StatCard");
    expect(page).not.toMatch(/\bbg-white\b/);
    expect(page).not.toMatch(/\bborder-gray-200\b/);
  });

  it("shows honest fulfillment bridge status without fake PO/inventory counts", () => {
    const page = read("page.tsx");
    expect(page).toContain("isExpressBridgeConfigured");
    expect(page).toContain("Requires bridge");
    expect(page).not.toMatch(/inventoryCount|poCount|purchaseOrderCount/i);
  });

  it("scopes the fulfillment-actions warning to order actions only (not users/net terms/inventory/PO)", () => {
    const page = read("page.tsx");
    // Truthful: keyed on the order fulfillment availability policy, not mere env presence.
    expect(page).toContain("isOrderFulfillmentAvailable");
    expect(page).toContain("ship/status, invoice payment, create PO");
    // The fulfillment card must not describe native Supabase modules as bridge-dependent.
    expect(page).not.toContain("PO, inventory, users, net terms");
  });

  it("prioritizes priority queues before catalog readiness", () => {
    const page = read("page.tsx");
    const queueIdx = page.indexOf("Priority queues");
    const catalogIdx = page.indexOf("Catalog readiness");
    expect(queueIdx).toBeGreaterThan(-1);
    expect(catalogIdx).toBeGreaterThan(queueIdx);
  });

  it("still uses describeQuoteStatusForOperator for quote lifecycle copy", () => {
    const table = read("_components/AdminRecentQuotesTable.tsx");
    expect(table).toContain("describeQuoteStatusForOperator");
  });
});
