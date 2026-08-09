import { describe, expect, it } from "vitest";
import { BOTID_PROTECTED_ROUTES } from "./botid-protected-routes";

describe("BOTID_PROTECTED_ROUTES", () => {
  it("lists the fail-closed public write routes", () => {
    const keys = BOTID_PROTECTED_ROUTES.map((r) => `${r.method} ${r.path}`).sort();
    expect(keys).toEqual(
      [
        "POST /api/ai/glove-finder",
        "POST /api/ai/invoice/recommend",
        "POST /api/auth/self-signup/finalize",
        "POST /api/contact",
        "POST /api/gloves/recommend",
        "POST /api/invoice/intake",
        "POST /api/leads/request-pricing",
        "POST /api/quote-request",
      ].sort(),
    );
  });
});
