import { describe, it, expect, vi } from "vitest";
import {
  generateInviteToken,
  hashInviteToken,
  createCompanyInvite,
  validateInviteToken,
  revokeCompanyInvite,
  acceptCompanyInvite,
} from "./admin-company-invite";

describe("generateInviteToken", () => {
  it("returns a base64url string of expected length", () => {
    const token = generateInviteToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(30);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique tokens", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateInviteToken());
    }
    expect(tokens.size).toBe(100);
  });
});

describe("hashInviteToken", () => {
  it("returns a hex string", () => {
    const hash = hashInviteToken("test-token");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic", () => {
    const hash1 = hashInviteToken("my-token");
    const hash2 = hashInviteToken("my-token");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different tokens", () => {
    const hash1 = hashInviteToken("token-a");
    const hash2 = hashInviteToken("token-b");
    expect(hash1).not.toBe(hash2);
  });
});

describe("createCompanyInvite", () => {
  it("throws on invalid email", async () => {
    const supabase = { schema: vi.fn() };
    await expect(
      createCompanyInvite(supabase, {
        companyId: "c1",
        email: "invalid",
        invitedByUserId: "u1",
      }),
    ).rejects.toThrow("invalid_email");
  });

  it("throws if company not found", async () => {
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    };

    await expect(
      createCompanyInvite(supabase, {
        companyId: "c1",
        email: "test@example.com",
        invitedByUserId: "u1",
      }),
    ).rejects.toThrow("company_not_found");
  });

  it("throws if active invite exists", async () => {
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "companies") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: "c1" }, error: null }),
                }),
              }),
            };
          }
          if (table === "company_invitations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  ilike: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      is: vi.fn().mockReturnValue({
                        gt: vi.fn().mockReturnValue({
                          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "inv1" }, error: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn() };
        }),
      }),
    };

    await expect(
      createCompanyInvite(supabase, {
        companyId: "c1",
        email: "test@example.com",
        invitedByUserId: "u1",
      }),
    ).rejects.toThrow("active_invite_exists");
  });
});

describe("validateInviteToken", () => {
  it("returns not_found for unknown token", async () => {
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    };

    const result = await validateInviteToken(supabase, "unknown-token");
    expect(result).toEqual({ valid: false, reason: "not_found" });
  });

  it("returns expired for expired invite", async () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "inv1",
                  expires_at: pastDate,
                  revoked_at: null,
                  accepted_at: null,
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const result = await validateInviteToken(supabase, "some-token");
    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("returns revoked for revoked invite", async () => {
    const futureDate = new Date(Date.now() + 100000).toISOString();
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "inv1",
                  expires_at: futureDate,
                  revoked_at: new Date().toISOString(),
                  accepted_at: null,
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const result = await validateInviteToken(supabase, "some-token");
    expect(result).toEqual({ valid: false, reason: "revoked" });
  });

  it("returns accepted for already-used invite", async () => {
    const futureDate = new Date(Date.now() + 100000).toISOString();
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "inv1",
                  expires_at: futureDate,
                  revoked_at: null,
                  accepted_at: new Date().toISOString(),
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const result = await validateInviteToken(supabase, "some-token");
    expect(result).toEqual({ valid: false, reason: "accepted" });
  });
});

describe("revokeCompanyInvite", () => {
  it("returns revoked: true when successful", async () => {
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  select: vi.fn().mockResolvedValue({ data: [{ id: "inv1" }], error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await revokeCompanyInvite(supabase, "inv1");
    expect(result).toEqual({ revoked: true });
  });

  it("returns revoked: false when not found", async () => {
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  select: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await revokeCompanyInvite(supabase, "inv-unknown");
    expect(result).toEqual({ revoked: false });
  });
});

describe("acceptCompanyInvite", () => {
  it("throws email_mismatch when user email differs", async () => {
    const futureDate = new Date(Date.now() + 100000).toISOString();
    const tokenHash = hashInviteToken("test-token");

    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "company_invitations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: "inv1",
                      company_id: "c1",
                      email: "invited@example.com",
                      role: "member",
                      expires_at: futureDate,
                      revoked_at: null,
                      accepted_at: null,
                      created_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "companies") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { trade_name: "Test Co" },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn() };
        }),
      }),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { email: "different@example.com" } },
            error: null,
          }),
        },
      },
    };

    await expect(acceptCompanyInvite(supabase, "test-token", "user-1")).rejects.toThrow(
      "email_mismatch",
    );
  });

  it("is idempotent when user is already a member", async () => {
    const futureDate = new Date(Date.now() + 100000).toISOString();
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "company_invitations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: "inv1",
                      company_id: "c1",
                      email: "buyer@example.com",
                      role: "member",
                      expires_at: futureDate,
                      revoked_at: null,
                      accepted_at: null,
                      created_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
              update: updateFn,
            };
          }
          if (table === "companies") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { trade_name: "Test Co" },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "company_members") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: "existing-member-id" },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn() };
        }),
      }),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { email: "buyer@example.com" } },
            error: null,
          }),
        },
      },
    };

    const result = await acceptCompanyInvite(supabase, "test-token", "user-1");
    
    expect(result.member_id).toBe("existing-member-id");
    expect(result.company_id).toBe("c1");
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ accepted_at: expect.any(String), accepted_user_id: "user-1" }),
    );
  });
});
