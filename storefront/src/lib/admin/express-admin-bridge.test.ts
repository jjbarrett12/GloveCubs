import { afterEach, describe, expect, it, vi } from "vitest";
import { mintExpressAdminJwt } from "./express-admin-bridge";

describe("express-admin-bridge", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses mint when JWT_SECRET is missing", () => {
    vi.stubEnv("JWT_SECRET", "");
    const r = mintExpressAdminJwt({ id: "00000000-0000-4000-8000-000000000001", email: "op@test.com" });
    expect(r).toHaveProperty("error");
  });

  it("mints a short-lived JWT with operator id", () => {
    vi.stubEnv("JWT_SECRET", "test-secret-for-bridge-only");
    const r = mintExpressAdminJwt({ id: "00000000-0000-4000-8000-000000000001", email: "op@test.com" });
    expect(r).toHaveProperty("token");
    if (!("token" in r)) return;
    const parts = r.token.split(".");
    expect(parts.length).toBe(3);
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as { id: string };
    expect(payload.id).toBe("00000000-0000-4000-8000-000000000001");
  });
});
