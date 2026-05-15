import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("buyer shipping addresses policy", () => {
  const gate = join(__dirname, "buyer-shipping-addresses-gate.ts");
  const roleHelper = join(__dirname, "../commerce/ship-to-address-mutation-role.ts");
  const listRoute = join(__dirname, "../../app/api/account/shipping-addresses/route.ts");
  const itemRoute = join(__dirname, "../../app/api/account/shipping-addresses/[addressId]/route.ts");
  const setDefaultRoute = join(__dirname, "../../app/api/account/shipping-addresses/[addressId]/set-default/route.ts");
  const page = join(__dirname, "../../app/account/shipping-addresses/page.tsx");
  const client = join(__dirname, "../../app/account/shipping-addresses/BuyerShipToAddressesClient.tsx");
  const aliasPage = join(__dirname, "../../app/account/addresses/page.tsx");
  const adminHelper = join(__dirname, "../admin/admin-ship-to-addresses.ts");

  it("buyer gate imports resolveCustomerProcurementGate and assertCustomerCompanyAccess", () => {
    const s = readFileSync(gate, "utf8");
    expect(s).toContain("resolveCustomerProcurementGate");
    expect(s).toContain("assertCustomerCompanyAccess");
  });

  it("buyer APIs import resolveCustomerProcurementGate via gate helper", () => {
    for (const p of [listRoute, itemRoute, setDefaultRoute]) {
      const s = readFileSync(p, "utf8");
      expect(s).toContain("resolveBuyerShippingAddressesGate");
    }
    const g = readFileSync(gate, "utf8");
    expect(g).toContain("resolveCustomerProcurementGate");
    expect(g).toContain("assertCustomerCompanyAccess");
  });

  it("buyer APIs do not treat company_id from client as authority", () => {
    for (const p of [listRoute, itemRoute, setDefaultRoute]) {
      const s = readFileSync(p, "utf8");
      expect(s).not.toMatch(/searchParams\.get\(\s*["']company_id["']\s*\)/);
      expect(s).not.toMatch(/parsed\.data\.company_id|body\.company_id/i);
    }
  });

  it("buyer API routes avoid browser Supabase client factories", () => {
    for (const p of [listRoute, itemRoute, setDefaultRoute]) {
      const s = readFileSync(p, "utf8");
      expect(s).not.toContain("createBrowserClient");
      expect(s).not.toContain("createClientComponentClient");
    }
  });

  it("buyer DELETE archives via helper and does not hard-delete ship_to_addresses", () => {
    const s = readFileSync(itemRoute, "utf8");
    expect(s).toContain("archiveAdminShipToAddress");
    expect(s).not.toMatch(/\.from\(\s*["']ship_to_addresses["']\s*\)\s*\.delete/i);
  });

  it("mutation role helper exists and excludes viewer and billing", () => {
    const s = readFileSync(roleHelper, "utf8");
    expect(s).toContain("canMutateShipToAddresses");
    expect(s).toContain('"owner"');
    expect(s).toContain('"admin"');
    expect(s).toContain('"member"');
    expect(s).not.toMatch(/canMutateShipToAddresses[\s\S]*viewer/);
    expect(s).not.toMatch(/canMutateShipToAddresses[\s\S]*billing/);
  });

  it("shipping addresses page contains required shared-address copy", () => {
    const s = readFileSync(page, "utf8");
    expect(s).toContain("Shipping addresses are shared by your company.");
    expect(s).toContain("They will be used for future quote and order workflows.");
    expect(s).toContain("Changing an address will not change past order records.");
  });

  it("buyer client shows read-only role message and avoids checkout and rate language", () => {
    const s = readFileSync(client, "utf8");
    expect(s).toContain("Your role can view shipping addresses but cannot change them.");
    const lower = s.toLowerCase();
    expect(lower).not.toContain("checkout");
    expect(lower).not.toContain("shipping_rate");
    expect(lower).not.toContain("tax_rate");
    expect(lower).not.toContain("payment_intent");
    expect(lower).not.toContain("stripe");
  });

  it("account addresses alias redirects to canonical shipping addresses path", () => {
    const s = readFileSync(aliasPage, "utf8");
    expect(s).toContain('redirect("/account/shipping-addresses")');
  });

  it("buyer routes reuse admin ship-to persistence helpers", () => {
    const combined = [listRoute, itemRoute, setDefaultRoute].map((p) => readFileSync(p, "utf8")).join("\n");
    expect(combined).toContain("fetchAdminShipToAddresses");
    expect(combined).toContain("createAdminShipToAddress");
    expect(combined).toContain("updateAdminShipToAddress");
    expect(combined).toContain("archiveAdminShipToAddress");
    expect(combined).toContain("setDefaultAdminShipToAddress");
    expect(readFileSync(adminHelper, "utf8")).toContain("normalizeShipToAddressInput");
  });
});
