import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin ship-to addresses policy", () => {
  const helper = join(__dirname, "admin-ship-to-addresses.ts");
  const listRoute = join(__dirname, "../../app/admin/api/companies/[companyId]/ship-to-addresses/route.ts");
  const itemRoute = join(__dirname, "../../app/admin/api/companies/[companyId]/ship-to-addresses/[addressId]/route.ts");
  const setDefaultRoute = join(
    __dirname,
    "../../app/admin/api/companies/[companyId]/ship-to-addresses/[addressId]/set-default/route.ts",
  );
  const ui = join(__dirname, "../../app/admin/companies/CompanyShipToAddressesManager.tsx");

  it("helper uses gc_commerce.ship_to_addresses only (no public.users, no companies shipping columns)", () => {
    const s = readFileSync(helper, "utf8");
    expect(s).toContain('.schema("gc_commerce")');
    expect(s).toContain('.from("ship_to_addresses")');
    expect(s).not.toContain("public.users");
    expect(s).not.toContain('from("users")');
    expect(s).not.toContain("shipping_address");
    expect(s).not.toContain("ship_to_line");
  });

  it("archive path sets address.is_archived via update (JSONB convention)", () => {
    const s = readFileSync(helper, "utf8");
    expect(s).toContain("is_archived");
    expect(s).toContain("updateAdminShipToAddress");
  });

  it("DELETE route archives via helper and does not hard-delete rows", () => {
    const s = readFileSync(itemRoute, "utf8");
    expect(s).toContain("getAdminUser");
    expect(s).toContain("archiveAdminShipToAddress");
    expect(s).not.toMatch(/\.from\(\s*["']ship_to_addresses["']\s*\)\s*\.delete/i);
    expect(s).not.toMatch(/\.delete\s*\(\s*\)/);
  });

  it("set-default helper clears defaults then sets target", () => {
    const s = readFileSync(helper, "utf8");
    expect(s).toContain("setDefaultAdminShipToAddress");
    expect(s).toContain("is_default");
    expect(s).toContain("false");
    expect(s).toContain("true");
  });

  it("set-default route delegates to helper and returns refreshed list", () => {
    const s = readFileSync(setDefaultRoute, "utf8");
    expect(s).toContain("getAdminUser");
    expect(s).toContain("setDefaultAdminShipToAddress");
    expect(s).toContain("fetchAdminShipToAddresses");
  });

  it("list and mutation routes require admin and service-role client", () => {
    for (const p of [listRoute, itemRoute, setDefaultRoute]) {
      const s = readFileSync(p, "utf8");
      expect(s).toContain("getAdminUser");
      expect(s).toContain("401");
      expect(s).toContain("getSupabaseAdmin");
    }
  });

  it("list POST body schema does not accept company_id from client as authority", () => {
    const s = readFileSync(listRoute, "utf8");
    expect(s).not.toContain("company_id:");
    expect(s).not.toMatch(/body.*company_id|parsed\.data\.company_id/i);
  });

  it("API route files avoid payment / tax / shipping-rate product language", () => {
    for (const p of [listRoute, itemRoute, setDefaultRoute]) {
      const s = readFileSync(p, "utf8").toLowerCase();
      expect(s).not.toContain("stripe");
      expect(s).not.toContain("payment_intent");
      expect(s).not.toContain("tax_rate");
      expect(s).not.toContain("shipping_rate");
      expect(s).not.toContain("fulfillment_queue");
    }
  });

  it("buyer-facing copy documents quote/order snapshot behavior", () => {
    const s = readFileSync(ui, "utf8");
    expect(s).toContain("Future quotes and orders will snapshot selected addresses");
  });
});
