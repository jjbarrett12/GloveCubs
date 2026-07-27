import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolveUserFromAdminCookies = vi.fn();
const maybeSingle = vi.fn();
const eq2 = vi.fn(() => ({ maybeSingle }));
const eq1 = vi.fn(() => ({ eq: eq2 }));
const select = vi.fn(() => ({ eq: eq1 }));
const from = vi.fn(() => ({ select }));
const createClient = vi.fn((..._args: unknown[]) => ({ from }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, options?: Record<string, unknown>) =>
    createClient(url, key, options),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({}),
}));

vi.mock("@/lib/auth/post-login-session", () => ({
  resolveUserFromAdminCookies: (...args: unknown[]) => resolveUserFromAdminCookies(...args),
}));

describe("resolveAdminAccess", () => {
  const PREV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    maybeSingle.mockResolvedValue({ data: null });
  });

  afterEach(() => {
    process.env = { ...PREV };
  });

  async function load() {
    return import("./get-admin-user");
  }

  it("denies anonymous users (no session)", async () => {
    resolveUserFromAdminCookies.mockResolvedValue(null);
    const { resolveAdminAccess } = await load();
    await expect(resolveAdminAccess()).resolves.toEqual({ kind: "sign_in_required" });
    expect(from).not.toHaveBeenCalled();
  });

  it("denies normal authenticated user without admin_users row", async () => {
    resolveUserFromAdminCookies.mockResolvedValue({
      id: "user-1",
      email: "buyer@example.com",
      user_metadata: { role: "admin" },
    });
    maybeSingle.mockResolvedValue({ data: null });
    const { resolveAdminAccess } = await load();
    await expect(resolveAdminAccess()).resolves.toEqual({ kind: "not_admin" });
    expect(from).toHaveBeenCalledWith("admin_users");
  });

  it("ignores spoofed user_metadata.role", async () => {
    resolveUserFromAdminCookies.mockResolvedValue({
      id: "user-2",
      email: "spoof@example.com",
      user_metadata: { role: "admin" },
      app_metadata: { role: "admin" },
    });
    maybeSingle.mockResolvedValue({ data: null });
    const { resolveAdminAccess, getAdminUser } = await load();
    const access = await resolveAdminAccess();
    expect(access.kind).toBe("not_admin");
    expect(await getAdminUser()).toBeNull();
    // Membership query is by auth user id + is_active only — never metadata.
    expect(eq1).toHaveBeenCalledWith("id", "user-2");
    expect(eq2).toHaveBeenCalledWith("is_active", true);
  });

  it("denies @glovecubs.com email without admin_users membership", async () => {
    resolveUserFromAdminCookies.mockResolvedValue({
      id: "user-3",
      email: "ops@glovecubs.com",
      user_metadata: {},
    });
    maybeSingle.mockResolvedValue({ data: null });
    const { resolveAdminAccess } = await load();
    await expect(resolveAdminAccess()).resolves.toEqual({ kind: "not_admin" });
  });

  it("allows active administrator from admin_users", async () => {
    resolveUserFromAdminCookies.mockResolvedValue({
      id: "admin-1",
      email: "admin@glovecubs.com",
    });
    maybeSingle.mockResolvedValue({ data: { id: "admin-1", is_active: true } });
    const { resolveAdminAccess, getAdminOperator } = await load();
    await expect(resolveAdminAccess()).resolves.toEqual({
      kind: "ok",
      userId: "admin-1",
      email: "admin@glovecubs.com",
    });
    await expect(getAdminOperator()).resolves.toEqual({
      id: "admin-1",
      email: "admin@glovecubs.com",
    });
  });

  it("denies removed / inactive administrator", async () => {
    resolveUserFromAdminCookies.mockResolvedValue({
      id: "admin-2",
      email: "former@glovecubs.com",
    });
    // Query filters is_active=true, so inactive rows return null.
    maybeSingle.mockResolvedValue({ data: null });
    const { resolveAdminAccess } = await load();
    await expect(resolveAdminAccess()).resolves.toEqual({ kind: "not_admin" });
  });

  it("source text never authorizes via user_metadata lookups or email domain", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve(__dirname, "get-admin-user.ts"), "utf8");
    // Comments may mention forbidden mechanisms; executable auth must use admin_users only.
    const withoutBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(withoutBlockComments).not.toMatch(/user_metadata/);
    expect(withoutBlockComments).not.toMatch(/endsWith\(/);
    expect(withoutBlockComments).not.toMatch(/@glovecubs\.com/);
    expect(withoutBlockComments).toContain('from("admin_users")');
  });
});
