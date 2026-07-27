import { describe, expect, it } from "vitest";
import {
  evaluateCatalogosAdminAuth,
  getCatalogosInternalApiKey,
  isCatalogosProductionLikeRuntime,
} from "./catalogos-admin-auth";

describe("evaluateCatalogosAdminAuth", () => {
  it("denies when secret absent in production-like runtime", () => {
    const d = evaluateCatalogosAdminAuth({
      secret: null,
      bearer: "",
      cookieToken: "",
      apiKey: "",
      productionLike: true,
      allowInsecureDev: true,
      internalKey: null,
    });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.status).toBe(503);
  });

  it("denies when secret absent in development without insecure flag", () => {
    const d = evaluateCatalogosAdminAuth({
      secret: null,
      bearer: "",
      cookieToken: "",
      apiKey: "",
      productionLike: false,
      allowInsecureDev: false,
      internalKey: null,
    });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.status).toBe(503);
  });

  it("allows open access only when insecure-dev is explicit and not production-like", () => {
    const d = evaluateCatalogosAdminAuth({
      secret: null,
      bearer: "",
      cookieToken: "",
      apiKey: "",
      productionLike: false,
      allowInsecureDev: true,
      internalKey: null,
    });
    expect(d).toEqual({ ok: true });
  });

  it("denies incorrect secret", () => {
    const d = evaluateCatalogosAdminAuth({
      secret: "correct",
      bearer: "wrong",
      cookieToken: "",
      apiKey: "",
      productionLike: true,
      allowInsecureDev: false,
      internalKey: null,
    });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.status).toBe(401);
  });

  it("allows correct bearer secret", () => {
    const d = evaluateCatalogosAdminAuth({
      secret: "correct",
      bearer: "correct",
      cookieToken: "",
      apiKey: "",
      productionLike: true,
      allowInsecureDev: false,
      internalKey: null,
    });
    expect(d).toEqual({ ok: true });
  });

  it("allows correct cookie secret", () => {
    const d = evaluateCatalogosAdminAuth({
      secret: "correct",
      bearer: "",
      cookieToken: "correct",
      apiKey: "",
      productionLike: true,
      allowInsecureDev: false,
      internalKey: null,
    });
    expect(d).toEqual({ ok: true });
  });
});

describe("isCatalogosProductionLikeRuntime", () => {
  it("treats Vercel preview as production-like", () => {
    expect(
      isCatalogosProductionLikeRuntime({ VERCEL_ENV: "preview" } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});

describe("getCatalogosInternalApiKey", () => {
  it("does not invent a weak default in production", () => {
    expect(
      getCatalogosInternalApiKey({
        NODE_ENV: "production",
        INTERNAL_API_KEY: "",
      } as unknown as NodeJS.ProcessEnv),
    ).toBeNull();
  });
});
