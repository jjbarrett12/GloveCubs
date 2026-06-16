import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatShipToLabel, formatShipToOneLine } from "./ship-to-address-format";

describe("ship-to-address-format", () => {
  it("formats one line from v1 snapshot", () => {
    const snap = {
      _v: 1,
      recipient_name: "A",
      address_line_1: "1 Main",
      city: "X",
      region: "ST",
      postal_code: "12345",
      country_code: "US",
      is_archived: false,
    };
    expect(formatShipToOneLine(snap)).toContain("1 Main");
    expect(formatShipToOneLine(snap)).toContain("12345");
  });

  it("formatShipToLabel prefixes label when present", () => {
    const snap = {
      _v: 1,
      recipient_name: "A",
      address_line_1: "1 Main",
      city: "X",
      region: "ST",
      postal_code: "1",
      country_code: "US",
      is_archived: false,
    };
    expect(formatShipToLabel("HQ", snap)).toMatch(/^HQ ·/);
  });
});

describe("Phase 1C quote ship-to policy", () => {
  const migration = join(
    __dirname,
    "../../../../supabase/migrations/20261216090000_catalogos_quote_requests_ship_to.sql",
  );
  const route = join(__dirname, "../../app/api/quote-request/route.ts");
  const quoteCart = join(__dirname, "../../app/quote-cart/page.tsx");
  const buyerSnapshot = join(__dirname, "../account/buyer-account-snapshot.ts");
  const adminLeads = join(__dirname, "../../app/admin/leads/page.tsx");
  const resolver = join(__dirname, "quote-request-ship-to.ts");

  it("migration adds ship_to columns and FK to gc_commerce.ship_to_addresses", () => {
    const s = readFileSync(migration, "utf8");
    expect(s).toContain("ship_to_address_id");
    expect(s).toContain("ship_to_snapshot");
    expect(s).toContain("ship_to_label");
    expect(s).toContain("REFERENCES gc_commerce.ship_to_addresses");
    expect(s).toMatch(/immutable|quote-time/i);
    const lower = s.toLowerCase();
    expect(lower).not.toContain("shipping_rate");
    expect(lower).not.toContain("tax_rate");
    expect(lower).not.toContain("payment_intent");
    expect(lower).not.toContain("stripe");
  });

  it("quote-request route accepts optional ship_to_address_id and rejects strict company_id", () => {
    const s = readFileSync(route, "utf8");
    expect(s).toContain("ship_to_address_id");
    expect(s).toContain("resolveQuoteShipToSnapshot");
    expect(s).toContain(".strict()");
    expect(s).not.toMatch(/parsed\.data\.gc_company_id|body\.gc_company_id/i);
    expect(s).not.toContain("createBrowserClient");
    expect(s).not.toMatch(/from\(\s*["']orders["']\s*\)\s*\.insert/i);
    const lower = s.toLowerCase();
    expect(lower).not.toContain("shipping_rate");
    expect(lower).not.toContain("tax_rate");
    expect(lower).not.toContain("stripe");
  });

  it("quote-request ship-to resolver uses gc_commerce.ship_to_addresses and parser", () => {
    const s = readFileSync(resolver, "utf8");
    expect(s).toContain('.schema("gc_commerce")');
    expect(s).toContain('.from("ship_to_addresses")');
    expect(s).toContain("tryParsePersistedShipToAddressJson");
    expect(s).toContain("is_archived");
  });

  it("quote cart shows ship-to selector only when loading addresses and includes required copy", () => {
    const s = readFileSync(quoteCart, "utf8");
    expect(s).toContain("/api/account/shipping-addresses");
    expect(s).toContain("Select a delivery location for this quote request.");
    expect(s).toContain("Shipping rates are not calculated here.");
    expect(s).toContain("Your team will confirm availability, pricing, and delivery details.");
    expect(s).toContain("ship_to_address_id");
    expect(s).not.toContain("ship_to_snapshot");
    expect(s).not.toMatch(/gc_company_id|company_id:\s*gate/i);
  });

  it("buyer quote history read model selects ship snapshot fields", () => {
    const s = readFileSync(buyerSnapshot, "utf8");
    expect(s).toContain("ship_to_snapshot");
    expect(s).toContain("ship_to_label");
    expect(s).not.toMatch(/from\(\s*["']ship_to_addresses["']\s*\)/i);
  });

  it("admin leads shows delivery context from snapshot and warns on id without snapshot", () => {
    const s = readFileSync(adminLeads, "utf8");
    expect(s).toContain("Delivery context");
    expect(s).toContain("formatShipToLabel");
    expect(s).toContain("ship_to_address_id");
    expect(s).toContain("ship_to_address_id without quote-time snapshot");
    const lower = s.toLowerCase();
    expect(lower).not.toContain("shipping_rate");
    expect(lower).not.toContain("stripe");
  });
});
