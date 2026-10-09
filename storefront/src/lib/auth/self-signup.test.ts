import { describe, expect, it, vi } from "vitest";
import {
  buildSelfSignupConfirmRedirectUrl,
  buildSelfSignupUserMetadata,
  sanitizeSignupText,
  SELF_SIGNUP_DEFAULT_REDIRECT,
  validateSelfSignupForm,
} from "@/lib/auth/self-signup-form";
import {
  canAttemptSelfSignupRecovery,
  finalizeSelfSignupForUser,
  parseSelfSignupMetadata,
  recoverSelfSignupIfNeeded,
} from "@/lib/auth/self-signup";

function membershipOnlySupabase(membership: { id: string; company_id: string } | null) {
  const membersChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: membership, error: null }),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn(),
    delete: vi.fn().mockReturnThis(),
  };
  const locksChain = {
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    schema: vi.fn((name: string) => ({
      from: (table: string) => {
        if (table === "company_members") return membersChain;
        if (table === "self_signup_finalize_locks") return locksChain;
        if (table === "companies") {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn(),
            ilike: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        throw new Error(`unexpected table ${table} in ${name}`);
      },
    })),
    _membersChain: membersChain,
    _locksChain: locksChain,
  };
}

describe("validateSelfSignupForm", () => {
  const valid = {
    firstName: "Jane",
    lastName: "Buyer",
    email: "buyer@example.com",
    password: "long-enough",
    confirmPassword: "long-enough",
    companyName: "Acme Gloves LLC",
  };

  it("accepts valid input", () => {
    const out = validateSelfSignupForm(valid);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.normalized.email).toBe("buyer@example.com");
      expect(out.normalized.companyName).toBe("Acme Gloves LLC");
    }
  });

  it("rejects invalid email", () => {
    expect(validateSelfSignupForm({ ...valid, email: "not-an-email" }).ok).toBe(false);
  });

  it("rejects weak password", () => {
    const out = validateSelfSignupForm({ ...valid, password: "short", confirmPassword: "short" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toContain("8 characters");
  });

  it("rejects mismatched password", () => {
    const out = validateSelfSignupForm({ ...valid, confirmPassword: "different-password" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toContain("do not match");
  });

  it("rejects missing company name", () => {
    expect(validateSelfSignupForm({ ...valid, companyName: "   " }).ok).toBe(false);
  });
});

describe("buildSelfSignupUserMetadata", () => {
  it("marks onboarding source as self_signup", () => {
    const meta = buildSelfSignupUserMetadata({
      firstName: "Jane",
      lastName: "Buyer",
      companyName: "Acme",
    });
    expect(meta.onboarding_source).toBe("self_signup");
    expect(meta.company_name).toBe("Acme");
  });
});

describe("buildSelfSignupConfirmRedirectUrl", () => {
  it("routes through auth callback to signup complete", () => {
    const url = buildSelfSignupConfirmRedirectUrl("https://www.glovecubs.com");
    expect(url).toBe("https://www.glovecubs.com/auth/callback?next=%2Fsignup%2Fcomplete");
  });
});

describe("parseSelfSignupMetadata", () => {
  it("requires company name", () => {
    expect(parseSelfSignupMetadata({ first_name: "Jane" })).toBeNull();
    expect(parseSelfSignupMetadata({ company_name: "Acme" })?.companyName).toBe("Acme");
  });
});

describe("canAttemptSelfSignupRecovery", () => {
  it("allows recovery when company_name metadata exists", () => {
    expect(canAttemptSelfSignupRecovery({ company_name: "Acme" })).toBe(true);
    expect(canAttemptSelfSignupRecovery({})).toBe(false);
  });
});

describe("sanitizeSignupText", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeSignupText("  Acme   Gloves  ", 80)).toBe("Acme Gloves");
  });
});

describe("finalizeSelfSignupForUser", () => {
  it("returns existing membership idempotently (repeated finalize)", async () => {
    const supabase = membershipOnlySupabase({ id: "member-1", company_id: "company-1" });
    const result = await finalizeSelfSignupForUser(supabase, "user-1", { company_name: "Acme" });
    expect(result.already_provisioned).toBe(true);
    expect(result.company_id).toBe("company-1");
    expect(result.redirect_path).toBe(SELF_SIGNUP_DEFAULT_REDIRECT);
    expect(supabase._locksChain.insert).not.toHaveBeenCalled();
  });

  it("creates active company and owner membership (normal signup)", async () => {
    const membersChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null }),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "member-new" }, error: null }),
      delete: vi.fn().mockReturnThis(),
    };

    const companiesChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "company-new",
          trade_name: "Acme",
          legal_name: null,
          slug: "acme",
          country_code: null,
          status: "active",
          b2b_pricing_tier_code: "cub",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        error: null,
      }),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    const locksChain = {
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    const supabase = {
      schema: vi.fn((name: string) => ({
        from: (table: string) => {
          if (table === "company_members") return membersChain;
          if (table === "companies") return companiesChain;
          if (table === "self_signup_finalize_locks") return locksChain;
          throw new Error(`unexpected table ${table} in ${name}`);
        },
      })),
    };

    const result = await finalizeSelfSignupForUser(supabase, "user-2", {
      company_name: "Acme",
      first_name: "Jane",
      last_name: "Buyer",
      onboarding_source: "self_signup",
    });

    expect(result.already_provisioned).toBe(false);
    expect(result.company_id).toBe("company-new");
    expect(result.member_id).toBe("member-new");
    expect(locksChain.insert).toHaveBeenCalled();
    expect(membersChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: "company-new",
        user_id: "user-2",
        role: "owner",
      }),
    );
  });

  it("throws when signup metadata is missing", async () => {
    const supabase = membershipOnlySupabase(null);
    await expect(finalizeSelfSignupForUser(supabase, "user-3", {})).rejects.toThrow("missing_signup_metadata");
  });
});

describe("recoverSelfSignupIfNeeded", () => {
  it("returns ready for existing membership", async () => {
    const supabase = membershipOnlySupabase({ id: "m1", company_id: "c1" });
    const out = await recoverSelfSignupIfNeeded(supabase, "user-1", {});
    expect(out.kind).toBe("ready");
    if (out.kind === "ready") expect(out.result.already_provisioned).toBe(true);
  });

  it("routes authenticated user without membership/metadata to signup complete", async () => {
    const supabase = membershipOnlySupabase(null);
    const out = await recoverSelfSignupIfNeeded(supabase, "user-x", {});
    expect(out).toEqual({ kind: "needs_complete", redirect_path: "/signup/complete" });
  });

  it("finalizes missed signup when metadata is present", async () => {
    const membersChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null }),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "member-r" }, error: null }),
      delete: vi.fn().mockReturnThis(),
    };
    const companiesChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "company-r",
          trade_name: "Recover Co",
          legal_name: null,
          slug: "recover-co",
          country_code: null,
          status: "active",
          b2b_pricing_tier_code: "cub",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        error: null,
      }),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const locksChain = {
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase = {
      schema: vi.fn(() => ({
        from: (table: string) => {
          if (table === "company_members") return membersChain;
          if (table === "companies") return companiesChain;
          if (table === "self_signup_finalize_locks") return locksChain;
          throw new Error(table);
        },
      })),
    };

    const out = await recoverSelfSignupIfNeeded(supabase, "user-r", {
      company_name: "Recover Co",
      onboarding_source: "self_signup",
    });
    expect(out.kind).toBe("ready");
    if (out.kind === "ready") {
      expect(out.result.company_id).toBe("company-r");
      expect(out.result.already_provisioned).toBe(false);
    }
  });
});
