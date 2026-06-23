import { describe, expect, it, vi } from "vitest";
import { fetchAdminUsers, isAuthUserUuid, updateAdminUser } from "./admin-users";

function mockSupabase(handlers: {
  usersSelect?: () => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
  usersSelectOne?: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  usersUpdate?: (updates: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  auditInsert?: (row: Record<string, unknown>) => Promise<{ error: null }>;
  authGetUser?: () => Promise<{ data: { user: { email: string } | null } }>;
}) {
  const from = vi.fn((table: string) => {
    if (table === "users") {
      return {
        select: vi.fn(() => ({
          order: vi.fn(() => handlers.usersSelect?.() ?? Promise.resolve({ data: [], error: null })),
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => handlers.usersSelectOne?.() ?? Promise.resolve({ data: null, error: null })),
          })),
        })),
        update: vi.fn((updates: Record<string, unknown>) => ({
          eq: vi.fn(() => handlers.usersUpdate?.(updates) ?? Promise.resolve({ error: null })),
        })),
      };
    }
    if (table === "pricing_tier_audit_log") {
      return {
        insert: vi.fn((row: Record<string, unknown>) => handlers.auditInsert?.(row) ?? Promise.resolve({ error: null })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return {
    from,
    auth: {
      admin: {
        getUserById: vi.fn(() => handlers.authGetUser?.() ?? Promise.resolve({ data: { user: null } })),
      },
    },
  } as unknown as Parameters<typeof fetchAdminUsers>[0];
}

describe("admin-users", () => {
  it("isAuthUserUuid accepts valid v4 ids", () => {
    expect(isAuthUserUuid("00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isAuthUserUuid("not-a-uuid")).toBe(false);
  });

  it("fetchAdminUsers returns rows without password fields", async () => {
    const supabase = mockSupabase({
      usersSelect: async () => ({
        data: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            email: "buyer@test.com",
            company_name: "Acme",
            contact_name: "Pat",
            is_approved: 0,
            discount_tier: "standard",
            payment_terms: "credit_card",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
        error: null,
      }),
    });

    const { rows, error, status } = await fetchAdminUsers(supabase);
    expect(error).toBeNull();
    expect(status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("buyer@test.com");
    expect(rows[0]).not.toHaveProperty("password_hash");
  });

  it("updateAdminUser persists approval and tier with audit on tier change", async () => {
    let capturedUpdate: Record<string, unknown> | null = null;
    let auditRow: Record<string, unknown> | null = null;

    const supabase = mockSupabase({
      usersSelectOne: async () => ({
        data: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "buyer@test.com",
          discount_tier: "standard",
          is_approved: 0,
          payment_terms: "credit_card",
        },
        error: null,
      }),
      usersUpdate: async (updates) => {
        capturedUpdate = updates;
        return { error: null };
      },
      auditInsert: async (row) => {
        auditRow = row;
        return { error: null };
      },
    });

    const result = await updateAdminUser(supabase, "00000000-0000-4000-8000-000000000001", {
      is_approved: true,
      discount_tier: "gold",
      payment_terms: "net30",
    });

    expect(result.error).toBeNull();
    expect(result.status).toBe(200);
    expect(capturedUpdate).toMatchObject({
      is_approved: 1,
      discount_tier: "gold",
      pricing_tier_source: "manual",
      payment_terms: "net30",
    });
    expect(auditRow).toMatchObject({
      user_id: "00000000-0000-4000-8000-000000000001",
      old_tier_code: "standard",
      new_tier_code: "gold",
      source: "admin_override",
    });
    expect(result.user).not.toHaveProperty("password_hash");
  });

  it("updateAdminUser returns 404 when user missing", async () => {
    const supabase = mockSupabase({
      usersSelectOne: async () => ({ data: null, error: null }),
    });

    const result = await updateAdminUser(supabase, "00000000-0000-4000-8000-000000000001", {
      is_approved: true,
    });
    expect(result.status).toBe(404);
    expect(result.error).toBe("User not found");
  });
});
