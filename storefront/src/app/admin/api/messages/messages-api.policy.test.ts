import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Phase 1C-ops slice 3 — contact messages", () => {
  it("GET messages requires operator and reads Supabase", () => {
    const s = readFileSync(join(__dirname, "route.ts"), "utf8");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("401");
    expect(s).toContain("fetchAdminContactMessages");
    expect(s).toContain("contact_messages_list");
    expect(s).not.toContain("/api/admin/contact-messages");
  });

  it("messages page reads contact_messages directly", () => {
    const page = readFileSync(join(__dirname, "../../messages/page.tsx"), "utf8");
    expect(page).toContain("fetchAdminContactMessages");
    expect(page).not.toContain("expressAdminFetch");
  });
});
