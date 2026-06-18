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

  it("returns true when membership exists for an active company", async () => {
    const supabase = {
      schema: () => ({
        from: (table: string) => {
          if (table === "company_members") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: { company_id: "co-a" }, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === "companies") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: { status: "active" }, error: null }),
                }),
              }),
            };
          }
          throw new Error(`unexpected table ${table}`);
        },
      }),
    };
    const ok = await assertCustomerCompanyAccess(supabase as any, "user-1", "co-a");
    expect(ok).toBe(true);
  });

  it("returns false when company is not active", async () => {
    const supabase = {
      schema: () => ({
        from: (table: string) => {
          if (table === "company_members") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: { company_id: "co-a" }, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === "companies") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: { status: "suspended" }, error: null }),
                }),
              }),
            };
          }
          throw new Error(`unexpected table ${table}`);
        },
      }),
    };
    const ok = await assertCustomerCompanyAccess(supabase as any, "user-1", "co-a");
    expect(ok).toBe(false);
  });
});
