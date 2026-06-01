import { describe, expect, it } from "vitest";
import { fetchHtmlEvidence } from "@/lib/admin/html-evidence";

describe("html-evidence fetch compatibility", () => {
  it("re-exports fetchHtmlForImport as fetchHtmlEvidence", () => {
    expect(typeof fetchHtmlEvidence).toBe("function");
  });
});
