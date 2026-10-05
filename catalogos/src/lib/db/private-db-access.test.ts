import { afterEach, describe, expect, it, vi } from "vitest";
import { validateCriticalEnv } from "@/lib/env";
import {
  catalogosDataPlane,
  resolvePrivateDatabaseAccess,
} from "./private-db-access";
import { assertPrivateDbProcess, privateSqlTransport, queryPrivate } from "./private-sql";

const PROD_APP = "https://mnmagwsenzvetwngaszv.supabase.co";
const PROD_DB = "postgresql://postgres.mnmagwsenzvetwngaszv:placeholder@db.mnmagwsenzvetwngaszv.supabase.co:5432/postgres";
const STAGING_APP = "https://fmrupehxifzkpfphiyvm.supabase.co";
const STAGING_DB = "postgresql://postgres.fmrupehxifzkpfphiyvm:placeholder@db.fmrupehxifzkpfphiyvm.supabase.co:5432/postgres";

const productionBase = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  SUPABASE_URL: PROD_APP,
  NEXT_PUBLIC_SUPABASE_URL: PROD_APP,
} as NodeJS.ProcessEnv;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("private database access contract", () => {
  it("uses the direct database path in production when SUPABASE_DB_URL matches the deployment", async () => {
    const env = { ...productionBase, SUPABASE_DB_URL: PROD_DB, STAGING_SQL_ACCESS_TOKEN: "sbp_test", STAGING_DATABASE_URL: STAGING_DB };
    expect(catalogosDataPlane(env)).toBe("production");
    expect(resolvePrivateDatabaseAccess(env)).toEqual({ kind: "direct", url: PROD_DB });
    const postgres = vi.spyOn(privateSqlTransport, "postgres").mockResolvedValue({ rows: [{ ok: 1 }], rowCount: 1 });
    const stagingApi = vi.spyOn(privateSqlTransport, "stagingApi").mockRejectedValue(new Error("staging API must not run"));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch must not run"));
    await expect(queryPrivate("select 1", [], env)).resolves.toEqual({ rows: [{ ok: 1 }], rowCount: 1 });
    expect(postgres).toHaveBeenCalledOnce();
    expect(stagingApi).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed in production when SUPABASE_DB_URL is missing", async () => {
    const env = { ...productionBase, STAGING_SQL_ACCESS_TOKEN: "sbp_test", STAGING_DATABASE_URL: STAGING_DB };
    const access = resolvePrivateDatabaseAccess(env);
    expect(access.kind).toBe("refused");
    if (access.kind === "refused") expect(access.reason).toMatch(/SUPABASE_DB_URL/);
    const stagingApi = vi.spyOn(privateSqlTransport, "stagingApi");
    await expect(queryPrivate("select 1", [], env)).rejects.toThrow(/SUPABASE_DB_URL/);
    expect(stagingApi).not.toHaveBeenCalled();
    expect(validateCriticalEnv(env).missing).toContain("SUPABASE_DB_URL");
  });

  it("does not let production use the staging SQL API or a staging database URL", async () => {
    const env = {
      ...productionBase,
      GC_ENVIRONMENT: "staging",
      SUPABASE_URL: STAGING_APP,
      NEXT_PUBLIC_SUPABASE_URL: STAGING_APP,
      STAGING_SQL_ACCESS_TOKEN: "sbp_test",
      STAGING_DATABASE_URL: STAGING_DB,
      CATALOGOS_ALLOW_STAGING_SQL_API: "1",
    } as NodeJS.ProcessEnv;
    expect(catalogosDataPlane(env)).toBe("production");
    expect(resolvePrivateDatabaseAccess(env).kind).toBe("refused");
    const stagingApi = vi.spyOn(privateSqlTransport, "stagingApi");
    await expect(queryPrivate("select 1", [], env)).rejects.toThrow(/cannot run in production/);
    expect(stagingApi).not.toHaveBeenCalled();
  });

  it("allows the staging SQL API only for an explicit staging runtime", async () => {
    const staging = {
      NODE_ENV: "development",
      GC_ENVIRONMENT: "staging",
      SUPABASE_URL: STAGING_APP,
      STAGING_SQL_ACCESS_TOKEN: "sbp_test",
    } as NodeJS.ProcessEnv;
    expect(resolvePrivateDatabaseAccess(staging)).toEqual({ kind: "staging-api" });
    const stagingApi = vi.spyOn(privateSqlTransport, "stagingApi").mockResolvedValue({ rows: [], rowCount: 0 });
    await queryPrivate("select 1", [], staging);
    expect(stagingApi).toHaveBeenCalledOnce();

    const localWithToken = {
      NODE_ENV: "development",
      SUPABASE_URL: STAGING_APP,
      STAGING_SQL_ACCESS_TOKEN: "sbp_test",
    } as NodeJS.ProcessEnv;
    expect(resolvePrivateDatabaseAccess(localWithToken).kind).toBe("unconfigured");

    const flaggedLocal = { ...localWithToken, CATALOGOS_ALLOW_STAGING_SQL_API: "1" } as NodeJS.ProcessEnv;
    expect(resolvePrivateDatabaseAccess(flaggedLocal).kind).toBe("staging-api");
  });

  it("prefers a direct staging database URL and refuses production URLs outside production", () => {
    const env = {
      NODE_ENV: "development",
      GC_ENVIRONMENT: "staging",
      SUPABASE_URL: STAGING_APP,
      STAGING_DATABASE_URL: STAGING_DB,
      STAGING_SQL_ACCESS_TOKEN: "sbp_test",
    } as NodeJS.ProcessEnv;
    expect(resolvePrivateDatabaseAccess(env)).toEqual({ kind: "direct", url: STAGING_DB });

    const productionUrl = { ...env, STAGING_DATABASE_URL: PROD_DB } as NodeJS.ProcessEnv;
    expect(resolvePrivateDatabaseAccess(productionUrl).kind).toBe("refused");
  });

  it("rejects a production database URL that belongs to a different project", () => {
    const env = { ...productionBase, SUPABASE_DB_URL: STAGING_DB };
    expect(resolvePrivateDatabaseAccess(env).kind).toBe("refused");
  });

  it("throws when the private database module is evaluated in a browser scope", () => {
    expect(() => assertPrivateDbProcess({ window: {} } as typeof globalThis)).toThrow(/server-only/);
    expect(() => assertPrivateDbProcess({} as typeof globalThis)).not.toThrow();
  });
});
