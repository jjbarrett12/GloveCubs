import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Admin health UI policy", () => {
  it("ModuleUnavailableState does not render JWT_SECRET or NEXT_PUBLIC_GLOVECUBS_API", () => {
    const s = readFileSync(
      join(__dirname, "../../../components/admin/ModuleUnavailableState.tsx"),
      "utf8",
    );
    expect(s).not.toContain("JWT_SECRET");
    expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
    expect(s).toContain("View Admin Health");
  });

  it("purchase-orders page does not show raw bridge env errors in module UI", () => {
    const s = readFileSync(join(__dirname, "page.tsx"), "utf8");
    expect(s).toContain("ModuleUnavailableState");
    expect(s).toContain("getAdminModuleAvailability");
    expect(s).not.toContain("JWT_SECRET");
    expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });

  it("inventory page does not show raw bridge env errors in module UI", () => {
    const s = readFileSync(join(__dirname, "../inventory/page.tsx"), "utf8");
    expect(s).toContain("ModuleUnavailableState");
    expect(s).not.toContain("JWT_SECRET");
    expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });

  it("users page does not show raw bridge env errors in module UI", () => {
    const s = readFileSync(join(__dirname, "../users/page.tsx"), "utf8");
    expect(s).toContain("ModuleUnavailableState");
    expect(s).not.toContain("JWT_SECRET");
    expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });

  it("net-terms page does not show raw bridge env errors in module UI", () => {
    const s = readFileSync(join(__dirname, "../net-terms/page.tsx"), "utf8");
    expect(s).toContain("ModuleUnavailableState");
    expect(s).not.toContain("JWT_SECRET");
    expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });
});
