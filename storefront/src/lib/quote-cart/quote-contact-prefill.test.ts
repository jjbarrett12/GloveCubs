import { describe, expect, it } from "vitest";
import {
  applyQuoteContactPrefillToFields,
  buildQuoteContactPrefill,
} from "@/lib/quote-cart/quote-contact-prefill";

describe("buildQuoteContactPrefill", () => {
  it("builds name, email, company, and phone from auth metadata and company row", () => {
    const prefill = buildQuoteContactPrefill({
      email: "buyer@example.com",
      userMetadata: {
        first_name: "Smoke",
        last_name: "Buyer",
        phone: "555-0100",
        company_name: "Ignored metadata company",
      },
      companyTradeName: "Canonical Company LLC",
    });
    expect(prefill).toEqual({
      email: "buyer@example.com",
      name: "Smoke Buyer",
      company: "Canonical Company LLC",
      phone: "555-0100",
    });
  });

  it("returns null when email is missing", () => {
    expect(
      buildQuoteContactPrefill({
        email: null,
        userMetadata: { first_name: "A", last_name: "B" },
        companyTradeName: "Co",
      }),
    ).toBeNull();
  });

  it("returns email-only prefill when name metadata is absent", () => {
    expect(
      buildQuoteContactPrefill({
        email: "buyer@example.com",
        userMetadata: {},
        companyTradeName: null,
      }),
    ).toEqual({ email: "buyer@example.com" });
  });
});

describe("applyQuoteContactPrefillToFields", () => {
  it("prefills only empty fields so buyer edits are preserved", () => {
    const { next, changed } = applyQuoteContactPrefillToFields(
      { name: "Custom Name", email: "", company: "", phone: "" },
      { email: "buyer@example.com", name: "Smoke Buyer", company: "Co", phone: "555" },
    );
    expect(changed).toBe(true);
    expect(next.name).toBe("Custom Name");
    expect(next.email).toBe("buyer@example.com");
    expect(next.company).toBe("Co");
    expect(next.phone).toBe("555");
  });

  it("does not overwrite existing contact fields", () => {
    const { next, changed } = applyQuoteContactPrefillToFields(
      { name: "A", email: "a@x.com", company: "B", phone: "1" },
      { email: "other@x.com", name: "Other", company: "Other Co", phone: "2" },
    );
    expect(changed).toBe(false);
    expect(next).toEqual({ name: "A", email: "a@x.com", company: "B", phone: "1" });
  });
});
