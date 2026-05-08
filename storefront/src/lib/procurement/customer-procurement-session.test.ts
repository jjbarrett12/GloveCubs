import { describe, expect, it } from "vitest";
import { assertCustomerCompanyAccess } from "@/lib/procurement/customer-procurement-session";

describe("assertCustomerCompanyAccess", () => {
  it("returns false when membership row missing", async () => {
    const supabase = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    };
    const ok = await assertCustomerCompanyAccess(supabase as any, "user-1", "co-a");
    expect(ok).toBe(false);
  });

  it("returns true when membership exists", async () => {
    const supabase = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { company_id: "co-a" }, error: null }),
              }),
            }),
          }),
        }),
      }),
    };
    const ok = await assertCustomerCompanyAccess(supabase as any, "user-1", "co-a");
    expect(ok).toBe(true);
  });
});
