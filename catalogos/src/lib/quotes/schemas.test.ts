import { describe, it, expect } from "vitest";
import { submitQuoteRequestSchema } from "./schemas";

describe("submitQuoteRequestSchema", () => {
  it("accepts valid payload", () => {
    const result = submitQuoteRequestSchema.safeParse({
      company_name: "Acme Inc.",
      contact_name: "Jane Doe",
      email: "jane@acme.com",
      phone: "+1234567890",
      notes: "Need by Friday",
      urgency: "standard",
      items: [
        { productId: "00000000-0000-0000-0000-000000000001", slug: "nitrile-gloves", name: "Nitrile Gloves", quantity: 100, notes: "" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty items", () => {
    const result = submitQuoteRequestSchema.safeParse({
      company_name: "Acme",
      contact_name: "Jane",
      email: "jane@acme.com",
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = submitQuoteRequestSchema.safeParse({
      company_name: "Acme",
      contact_name: "Jane",
      email: "not-an-email",
      items: [{ productId: "00000000-0000-0000-0000-000000000001", slug: "x", name: "Y", quantity: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid canonicalProductId on a line", () => {
    const result = submitQuoteRequestSchema.safeParse({
      company_name: "Acme",
      contact_name: "Jane",
      email: "jane@acme.com",
      items: [
        {
          productId: "00000000-0000-0000-0000-000000000001",
          canonicalProductId: "not-a-uuid",
          slug: "x",
          name: "Y",
          quantity: 1,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
