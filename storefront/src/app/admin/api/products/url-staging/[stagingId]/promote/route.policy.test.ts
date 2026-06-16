import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("clipboard url-staging promote route policy", () => {
  const route = join(__dirname, "route.ts");
  const productWrite = join(__dirname, "../../../../../../../lib/admin/product-write.ts");

  it("rejects status override and forces draft on promote write input", () => {
    const s = readFileSync(route, "utf8");
    expect(s).toContain("clipboardPromoteStatusOverrideError");
    expect(s).toContain("merged.status = \"draft\"");
    expect(s).toContain("clipboardImportMetadataFromStagingExtracted");
    expect(s).toContain("promoteStagingToDraftProduct");
    expect(s).not.toMatch(/\brunPublish\b/i);
    expect(s).not.toMatch(/parse-product-url|parseProductUrl/);
  });

  it("promoteStagingToDraftProduct and insert path stay draft-only for staging imports", () => {
    const s = readFileSync(productWrite, "utf8");
    const readiness = join(__dirname, "../../../../../../../lib/admin/product-write-active-readiness.ts");
    const readinessSrc = readFileSync(readiness, "utf8");
    const promoteFn = s.indexOf("export async function promoteStagingToDraftProduct");
    expect(promoteFn).toBeGreaterThan(-1);
    const promoteBody = s.slice(promoteFn, promoteFn + 400);
    expect(promoteBody).toContain("status: \"draft\"");
    expect(promoteBody).not.toContain("status: \"active\"");
    expect(s).toContain("evaluateActivePublishReadiness");
    expect(s).toContain("input.importStagingId?.trim() ? \"draft\"");
    expect(readinessSrc).toContain("clipboardUrlImportActiveStatusError");
  });
});
