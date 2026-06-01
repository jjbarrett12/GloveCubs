import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapClipboardStagingWriteError } from "./clipboard-url-staging";

describe("clipboard URL staging policy", () => {
  const helper = join(__dirname, "clipboard-url-staging.ts");
  const route = join(__dirname, "../../app/admin/api/products/url-staging/route.ts");
  const client = join(__dirname, "../../app/admin/products/import/_components/ClipboardUrlStagingClient.tsx");

  it("maps permission denied on admin_url_clipboard_staging to admin-safe copy", () => {
    const msg = mapClipboardStagingWriteError(
      'permission denied for table admin_url_clipboard_staging'
    );
    expect(msg).toContain("admin staging table could not be written");
    expect(msg).not.toContain("permission denied");
  });

  it("helper writes via service-role admin client and catalog_v2 schema", () => {
    const s = readFileSync(helper, "utf8");
    expect(s).toContain("getSupabaseAdmin");
    expect(s).toContain('.schema("catalog_v2")');
    expect(s).toContain('.from("admin_url_clipboard_staging")');
    expect(s).not.toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(s).not.toContain("createBrowserClient");
  });

  it("createClipboardStaging does not publish or call CatalogOS", () => {
    const s = readFileSync(helper, "utf8");
    expect(s).toContain("review_status");
    expect(s).toContain('"needs_review"');
    expect(s).not.toMatch(/catalogosInternalRequest|probeCatalogosHealth/i);
    expect(s).not.toMatch(/status:\s*[\"']active[\"']/);
    expect(s).not.toMatch(/publish\(/i);
  });

  it("createClipboardStaging uses productExtraction import draft pipeline", () => {
    const s = readFileSync(helper, "utf8");
    expect(s).toContain("extractProductFromHtml");
    expect(s).toContain("toImportDraftProductV1");
    expect(s).toContain("buildStagingExtractedPayload");
    expect(s).not.toContain("extractPageEvidence");
    expect(s).not.toContain("jsonLdProductHints");
  });

  it("POST route gates platform admin and does not block on CatalogOS for staging write", () => {
    const s = readFileSync(route, "utf8");
    expect(s).toContain("resolveAdminAccess");
    expect(s).toContain("403");
    expect(s).toContain("createClipboardStaging");
    const stagingCall = s.indexOf("createClipboardStaging");
    const catalogosProbe = s.indexOf("probeCatalogosHealth");
    expect(stagingCall).toBeGreaterThan(-1);
    expect(catalogosProbe).toBeGreaterThan(stagingCall);
    expect(s).toContain("staged: true");
  });

  it("client posts to admin API only (no direct Supabase writes)", () => {
    const s = readFileSync(client, "utf8");
    expect(s).toContain('"/admin/api/products/url-staging"');
    expect(s).not.toContain("createClient");
    expect(s).not.toContain("supabase");
  });
});

describe("catalog_v2 service_role grants migration", () => {
  it("grants catalog_v2 to service_role for PostgREST admin writes", () => {
    const p = join(
      __dirname,
      "../../../../supabase/migrations/20260520140000_catalog_v2_service_role_grants.sql"
    );
    const s = readFileSync(p, "utf8");
    expect(s).toContain("GRANT USAGE ON SCHEMA catalog_v2");
    expect(s).toContain("GRANT ALL ON ALL TABLES IN SCHEMA catalog_v2");
    expect(s).toContain("service_role");
  });
});
