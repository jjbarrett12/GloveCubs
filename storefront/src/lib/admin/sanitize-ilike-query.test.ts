import { describe, expect, it } from "vitest";
import { sanitizeIlikeQuery } from "@/lib/admin/sanitize-ilike-query";

describe("sanitizeIlikeQuery", () => {
  it("strips PostgREST ilike metacharacters", () => {
    expect(sanitizeIlikeQuery("nitrile%,foo_bar")).toBe("nitrilefoobar");
    expect(sanitizeIlikeQuery("  MDS-192086  ")).toBe("MDS-192086");
  });
});
