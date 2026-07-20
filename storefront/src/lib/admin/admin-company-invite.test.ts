import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateInviteToken,
  hashInviteToken,
  createCompanyInvite,
  revokeCompanyInvite,
  validateInviteToken,
  acceptCompanyInvite,
  expireStalePendingInvites,
} from "@/lib/admin/admin-company-invite";

describe("generateInviteToken / hashInviteToken (unit)", () => {
  it("returns a base64url string of expected length", () => {
    const token = generateInviteToken();
    expect(token.length).toBeGreaterThan(20);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique tokens", () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
  });

  it("hash is deterministic hex and differs by input", () => {
    expect(hashInviteToken("abc")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashInviteToken("abc")).toBe(hashInviteToken("abc"));
    expect(hashInviteToken("abc")).not.toBe(hashInviteToken("abd"));
  });
});

describe("invitation migration policy (unit)", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261220120000_gc_commerce_company_invitations.sql"),
    "utf8",
  );

  it("pending unique index has no now() / time-dependent predicate", () => {
    const pendingIdx = sql.match(
      /CREATE UNIQUE INDEX[\s\S]*?idx_company_invitations_pending_unique[\s\S]*?;/i,
    );
    expect(pendingIdx?.[0]).toBeTruthy();
    expect(pendingIdx![0].toLowerCase()).not.toContain("now()");
    expect(pendingIdx![0]).toMatch(/status\s*=\s*'pending'/i);
  });

  it("stores token_hash not raw token; grants service_role only", () => {
    expect(sql).toContain("token_hash");
    expect(sql).toMatch(/REVOKE ALL ON TABLE gc_commerce\.company_invitations FROM PUBLIC/i);
    expect(sql).toMatch(/GRANT ALL ON TABLE gc_commerce\.company_invitations TO service_role/i);
  });

  it("defines explicit status values including expired", () => {
    expect(sql).toMatch(/'pending',\s*'expired',\s*'revoked',\s*'accepted'/);
  });
});

describe("expireStalePendingInvites (mocked integration)", () => {
  it("marks pending rows with expires_at <= now as expired", async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: "old" }], error: null });
    const lte = vi.fn().mockReturnValue({ select });
    const eqStatus = vi.fn().mockReturnValue({ lte });
    const eqEmail = vi.fn().mockReturnValue({ eq: eqStatus });
    const eqCompany = vi.fn().mockReturnValue({ eq: eqEmail });
    const update = vi.fn().mockReturnValue({ eq: eqCompany });
    const supabase = {
      schema: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ update }) }),
    };

    const n = await expireStalePendingInvites(supabase, "c1", "a@b.co");
    expect(n).toBe(1);
    expect(update).toHaveBeenCalledWith({ status: "expired" });
  });
});

describe("createCompanyInvite (mocked integration)", () => {
  it("throws on invalid email", async () => {
    await expect(
      createCompanyInvite({} as any, {
        companyId: "c1",
        email: "bad",
        invitedByUserId: null,
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
      auth: { admin: { getUserById: vi.fn() } },
    };
    await expect(
      createCompanyInvite(supabase, {
        companyId: "missing",
        email: "a@b.co",
        invitedByUserId: null,
      }),
    ).rejects.toThrow("company_not_found");
  });

  it("first invitation inserts pending row", async () => {
    const chain: any = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.lte = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn();
    chain.single = vi.fn();
    chain.update = vi.fn().mockReturnValue(chain);
    chain.insert = vi.fn().mockReturnValue(chain);

    // companies lookup
    let fromCall = 0;
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockImplementation(() => {
          fromCall += 1;
          if (fromCall === 1) {
            // companies
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: "c1" }, error: null }),
                }),
              }),
            };
          }
          return chain;
        }),
      }),
      auth: { admin: { getUserById: vi.fn() } },
    };

    // expire stale
    chain.select.mockResolvedValueOnce({ data: [], error: null });
    // members list
    chain.select = vi.fn().mockImplementation(() => {
      const membersChain: any = {
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      return membersChain;
    });

    // Rebuild simpler dedicated mock for create success path
    const expireSelect = vi.fn().mockResolvedValue({ data: [], error: null });
    const membersEq = vi.fn().mockResolvedValue({ data: [], error: null });
    const pendingMaybe = vi.fn().mockResolvedValue({ data: null, error: null });
    const insertSingle = vi.fn().mockResolvedValue({
      data: { id: "inv1", expires_at: "2099-01-01T00:00:00.000Z" },
      error: null,
    });

    let invitationsStep = 0;
    const invitationsFrom = {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({ select: expireSelect }),
            }),
          }),
        }),
      }),
      select: vi.fn().mockImplementation(() => {
        invitationsStep += 1;
        if (invitationsStep === 1) {
          // members uses company_members — handled below
        }
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: pendingMaybe,
              }),
            }),
          }),
        };
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: insertSingle }),
      }),
    };

    const supabase2 = {
      schema: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "companies") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: "c1" }, error: null }),
                }),
              }),
            };
          }
          if (table === "company_members") {
            return { select: () => ({ eq: membersEq }) };
          }
          return invitationsFrom;
        }),
      })),
      auth: { admin: { getUserById: vi.fn() } },
    };

    const result = await createCompanyInvite(supabase2, {
      companyId: "c1",
      email: "Buyer@Example.com",
      invitedByUserId: "admin-1",
    });

    expect(result.reissued).toBe(false);
    expect(result.id).toBe("inv1");
    expect(result.rawToken.length).toBeGreaterThan(10);
    expect(invitationsFrom.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "buyer@example.com",
        email_normalized: "buyer@example.com",
        status: "pending",
      }),
    );
  });

  it("reissues existing pending invite (resend contract)", async () => {
    const expireSelect = vi.fn().mockResolvedValue({ data: [], error: null });
    const membersEq = vi.fn().mockResolvedValue({ data: [], error: null });
    const pendingMaybe = vi.fn().mockResolvedValue({
      data: { id: "inv-existing", expires_at: "2099-01-01T00:00:00.000Z" },
      error: null,
    });
    const updateSingle = vi.fn().mockResolvedValue({
      data: { id: "inv-existing", expires_at: "2099-01-08T00:00:00.000Z" },
      error: null,
    });

    let updateCalls = 0;
    const invitationsFrom = {
      update: vi.fn().mockImplementation(() => {
        updateCalls += 1;
        if (updateCalls === 1) {
          // expire stale
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({ select: expireSelect }),
                }),
              }),
            }),
          };
        }
        // reissue
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({ single: updateSingle }),
            }),
          }),
        };
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: pendingMaybe,
            }),
          }),
        }),
      }),
      insert: vi.fn(),
    };

    const supabase = {
      schema: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "companies") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: "c1" }, error: null }),
                }),
              }),
            };
          }
          if (table === "company_members") {
            return { select: () => ({ eq: membersEq }) };
          }
          return invitationsFrom;
        }),
      })),
      auth: { admin: { getUserById: vi.fn() } },
    };

    const result = await createCompanyInvite(supabase, {
      companyId: "c1",
      email: "a@b.co",
      invitedByUserId: null,
    });

    expect(result.reissued).toBe(true);
    expect(result.id).toBe("inv-existing");
    expect(invitationsFrom.insert).not.toHaveBeenCalled();
  });
});

describe("revokeCompanyInvite (mocked integration)", () => {
  it("scopes revoke to company_id and pending status", async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: "inv1" }], error: null });
    const eqStatus = vi.fn().mockReturnValue({ select });
    const eqCompany = vi.fn().mockReturnValue({ eq: eqStatus });
    const eqId = vi.fn().mockReturnValue({ eq: eqCompany });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    const supabase = {
      schema: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ update }) }),
    };

    const result = await revokeCompanyInvite(supabase, "inv1", "company-1");
    expect(result).toEqual({ revoked: true });
    expect(update).toHaveBeenCalledWith({
      status: "revoked",
      revoked_at: expect.any(String),
    });
    expect(eqId).toHaveBeenCalledWith("id", "inv1");
    expect(eqCompany).toHaveBeenCalledWith("company_id", "company-1");
  });

  it("returns revoked false when wrong company / not pending", async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({ select }),
              }),
            }),
          }),
        }),
      }),
    };
    expect(await revokeCompanyInvite(supabase, "inv-x", "other-co")).toEqual({ revoked: false });
  });
});

describe("validateInviteToken / acceptCompanyInvite (mocked integration)", () => {
  it("returns expired for expired invite", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "inv1",
                  company_id: "c1",
                  email: "a@b.co",
                  email_normalized: "a@b.co",
                  role: "member",
                  status: "pending",
                  expires_at: past,
                  revoked_at: null,
                  accepted_at: null,
                  created_at: past,
                },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    };
    expect(await validateInviteToken(supabase, "tok")).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("returns revoked for revoked invite", async () => {
    const future = new Date(Date.now() + 100000).toISOString();
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "inv1",
                  company_id: "c1",
                  email: "a@b.co",
                  role: "member",
                  status: "revoked",
                  expires_at: future,
                  revoked_at: future,
                  accepted_at: null,
                  created_at: future,
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };
    expect(await validateInviteToken(supabase, "tok")).toEqual({
      valid: false,
      reason: "revoked",
    });
  });

  it("throws email_mismatch when user email differs", async () => {
    const future = new Date(Date.now() + 100000).toISOString();
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "inv1",
                  company_id: "c1",
                  email: "invitee@example.com",
                  email_normalized: "invitee@example.com",
                  role: "member",
                  status: "pending",
                  expires_at: future,
                  revoked_at: null,
                  accepted_at: null,
                  created_at: future,
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { id: "u1", email: "other@example.com" } },
            error: null,
          }),
        },
      },
    };

    // validate needs company fetch after valid — simplify by mocking two from() behaviors
    // accept calls validate first which needs company trade_name for valid invites
    const inviteRow = {
      id: "inv1",
      company_id: "c1",
      email: "invitee@example.com",
      email_normalized: "invitee@example.com",
      role: "member",
      status: "pending",
      expires_at: future,
      revoked_at: null,
      accepted_at: null,
      created_at: future,
    };

    let selectCount = 0;
    const supabase2 = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "companies") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { trade_name: "Acme" }, error: null }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  selectCount += 1;
                  if (selectCount === 1) return { data: inviteRow, error: null };
                  return { data: null, error: null };
                },
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          };
        }),
      }),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { id: "u1", email: "other@example.com" } },
            error: null,
          }),
        },
      },
    };

    await expect(acceptCompanyInvite(supabase2, "tok", "u1")).rejects.toThrow("email_mismatch");
  });

  it("is idempotent when user is already a member", async () => {
    const future = new Date(Date.now() + 100000).toISOString();
    const inviteRow = {
      id: "inv1",
      company_id: "c1",
      email: "same@example.com",
      email_normalized: "same@example.com",
      role: "member",
      status: "pending",
      expires_at: future,
      revoked_at: null,
      accepted_at: null,
      created_at: future,
    };

    let invitationSelects = 0;
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "companies") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { trade_name: "Acme" }, error: null }),
                }),
              }),
            };
          }
          if (table === "company_members") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { id: "mem1" }, error: null }),
                  }),
                }),
              }),
              insert: vi.fn(),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  invitationSelects += 1;
                  return { data: inviteRow, error: null };
                },
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          };
        }),
      }),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { id: "u1", email: "same@example.com" } },
            error: null,
          }),
        },
      },
    };

    const result = await acceptCompanyInvite(supabase, "tok", "u1");
    expect(result).toEqual({ member_id: "mem1", company_id: "c1" });
  });
});

/**
 * Real Postgres proofs (staging /test — not claimed here):
 * - Concurrent create cannot yield two pending rows
 * - Expired pending permits replacement after expire transition
 * - Revoked/accepted permit replacement
 * - Duplicate accept creates one membership
 */
describe("invitation races — requires real Postgres (staging)", () => {
  it.todo("two concurrent creates cannot create duplicate pending rows");
  it.todo("expired pending invitation permits a replacement");
  it.todo("duplicate acceptance creates only one membership");
});
