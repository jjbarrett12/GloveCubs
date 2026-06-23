import { describe, expect, it, vi } from "vitest";
import {
  applyAdminNetTermsDecision,
  isGcCompanyUuid,
  mapApplicationRow,
  numOrNull,
} from "./admin-net-terms";

const APP_ID = "00000000-0000-4000-8000-000000000001";
const COMPANY_ID = "00000000-0000-4000-8000-000000000002";
const ADMIN_ID = "00000000-0000-4000-8000-000000000099";
const APPLICANT_ID = "00000000-0000-4000-8000-000000000003";

type GcHandlers = {
  appSelect?: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  appUpdate?: (
    updates: Record<string, unknown>,
  ) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  companyUpdate?: (
    updates: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
  listQuery?: () => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
  companiesIn?: () => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
};

function mockSupabase(gc: GcHandlers, publicHandlers?: {
  usersSelect?: () => Promise<{ data: Record<string, unknown>[] | null; error: null }>;
  usersSelectOne?: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
  usersUpdate?: (updates: Record<string, unknown>) => Promise<{ error: null }>;
}) {
  const gcFrom = vi.fn((table: string) => {
    if (table === "net_terms_applications") {
      return {
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              eq: vi.fn(() => gc.listQuery?.() ?? Promise.resolve({ data: [], error: null })),
            })),
          })),
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => gc.appSelect?.() ?? Promise.resolve({ data: null, error: null })),
          })),
        })),
        update: vi.fn((updates: Record<string, unknown>) => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => gc.appUpdate?.(updates) ?? Promise.resolve({ data: null, error: null })),
            })),
          })),
        })),
      };
    }
    if (table === "companies") {
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => gc.companiesIn?.() ?? Promise.resolve({ data: [], error: null })),
        })),
        update: vi.fn((updates: Record<string, unknown>) => ({
          eq: vi.fn(() => gc.companyUpdate?.(updates) ?? Promise.resolve({ error: null })),
        })),
      };
    }
    throw new Error(`unexpected gc table ${table}`);
  });

  return {
    schema: vi.fn((name: string) => {
      if (name !== "gc_commerce") throw new Error(`unexpected schema ${name}`);
      return { from: gcFrom };
    }),
    from: vi.fn((table: string) => {
      if (table !== "users") throw new Error(`unexpected public table ${table}`);
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => publicHandlers?.usersSelect?.() ?? Promise.resolve({ data: [], error: null })),
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(
              () => publicHandlers?.usersSelectOne?.() ?? Promise.resolve({ data: null, error: null }),
            ),
          })),
        })),
        update: vi.fn((updates: Record<string, unknown>) => ({
          eq: vi.fn(() => publicHandlers?.usersUpdate?.(updates) ?? Promise.resolve({ error: null })),
        })),
      };
    }),
  } as unknown as Parameters<typeof applyAdminNetTermsDecision>[0];
}

describe("admin-net-terms", () => {
  it("isGcCompanyUuid validates UUIDs", () => {
    expect(isGcCompanyUuid(APP_ID)).toBe(true);
    expect(isGcCompanyUuid("bad")).toBe(false);
  });

  it("numOrNull parses numbers", () => {
    expect(numOrNull("5000")).toBe(5000);
    expect(numOrNull("")).toBeNull();
  });

  it("mapApplicationRow maps core fields", () => {
    const row = mapApplicationRow({
      id: APP_ID,
      company_id: COMPANY_ID,
      applicant_user_id: APPLICANT_ID,
      status: "pending",
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(row?.status).toBe("pending");
    expect(row).not.toHaveProperty("password_hash");
  });

  it("deny updates application and company commercial fields", async () => {
    let appUpdates: Record<string, unknown> | null = null;
    let coUpdates: Record<string, unknown> | null = null;

    const supabase = mockSupabase({
      appSelect: async () => ({
        data: { id: APP_ID, company_id: COMPANY_ID, status: "pending", applicant_user_id: APPLICANT_ID },
        error: null,
      }),
      appUpdate: async (updates) => {
        appUpdates = updates;
        return {
          data: { id: APP_ID, company_id: COMPANY_ID, status: "denied", created_at: "2026-01-01T00:00:00Z" },
          error: null,
        };
      },
      companyUpdate: async (updates) => {
        coUpdates = updates;
        return { error: null };
      },
    });

    const result = await applyAdminNetTermsDecision(supabase, ADMIN_ID, APP_ID, {
      action: "deny",
      decision_notes: "Insufficient history",
    });

    expect(result.error).toBeNull();
    expect(result.status).toBe(200);
    expect(appUpdates).toMatchObject({
      status: "denied",
      decision_notes: "Insufficient history",
      reviewed_by_user_id: ADMIN_ID,
    });
    expect(coUpdates).toMatchObject({
      net_terms_status: "denied",
      invoice_orders_allowed: false,
      net_terms_reviewed_by_user_id: ADMIN_ID,
    });
  });

  it("approve sets company terms and approves applicant user", async () => {
    let coUpdates: Record<string, unknown> | null = null;
    let userUpdates: Record<string, unknown> | null = null;

    const supabase = mockSupabase(
      {
        appSelect: async () => ({
          data: { id: APP_ID, company_id: COMPANY_ID, status: "pending", applicant_user_id: APPLICANT_ID },
          error: null,
        }),
        appUpdate: async () => ({
          data: {
            id: APP_ID,
            company_id: COMPANY_ID,
            status: "approved",
            approved_invoice_terms_code: "net30",
            created_at: "2026-01-01T00:00:00Z",
          },
          error: null,
        }),
        companyUpdate: async (updates) => {
          coUpdates = updates;
          return { error: null };
        },
      },
      {
        usersSelectOne: async () => ({ data: { id: APPLICANT_ID }, error: null }),
        usersUpdate: async (updates) => {
          userUpdates = updates;
          return { error: null };
        },
      },
    );

    const result = await applyAdminNetTermsDecision(supabase, ADMIN_ID, APP_ID, {
      action: "approve",
      invoice_terms_code: "net30",
      invoice_orders_allowed: true,
    });

    expect(result.error).toBeNull();
    expect(coUpdates).toMatchObject({
      net_terms_status: "approved",
      invoice_terms_code: "net30",
      invoice_orders_allowed: true,
    });
    expect(userUpdates).toMatchObject({ is_approved: 1, payment_terms: "net30" });
  });

  it("hold rejects non-pending applications", async () => {
    const supabase = mockSupabase({
      appSelect: async () => ({
        data: { id: APP_ID, company_id: COMPANY_ID, status: "approved" },
        error: null,
      }),
    });

    const result = await applyAdminNetTermsDecision(supabase, ADMIN_ID, APP_ID, { action: "hold" });
    expect(result.status).toBe(400);
    expect(result.error).toContain("pending");
  });

  it("rejects invalid application id", async () => {
    const supabase = mockSupabase({});
    const result = await applyAdminNetTermsDecision(supabase, ADMIN_ID, "not-a-uuid", { action: "deny" });
    expect(result.status).toBe(400);
  });
});
