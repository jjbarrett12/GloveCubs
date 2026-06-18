import { describe, expect, it } from "vitest";
import {
  CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS,
  CLIPBOARD_EXTRACTION_AUTHORITY_LOCAL,
} from "@/lib/admin/clipboard-url-catalogos-extract";
import {
  clipboardImportMetadataFromStagingExtracted,
  clipboardPromoteStatusOverrideError,
  clipboardUrlImportActiveStatusError,
  isClipboardUrlImportProductMetadata,
  isCatalogosUrlImportProductMetadata,
  isUrlImportProductMetadata,
} from "@/lib/admin/clipboard-promote-guards";

describe("clipboard-promote-guards", () => {
  it("rejects active/published status in promote body", () => {
    expect(clipboardPromoteStatusOverrideError({ status: "active" })).toContain("must be reviewed");
    expect(clipboardPromoteStatusOverrideError({ status: "published" })).toBeTruthy();
    expect(clipboardPromoteStatusOverrideError({ status: "draft" })).toBeNull();
  });

  it("maps staging extracted blob to import metadata extras", () => {
    const meta = clipboardImportMetadataFromStagingExtracted({
      extraction_authority: CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS,
      catalogos_job_id: "job-abc",
      catalogos_product_id: "prod-xyz",
      source_product_page_url: "https://example.com/glove",
      product_setup_contract_summary: {
        schemaVersion: "glovecubs.product_setup_contract.v1",
      },
    });
    expect(meta.import_extraction_authority).toBe(CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS);
    expect(meta.catalogos_url_import_job_id).toBe("job-abc");
    expect(meta.catalogos_url_import_product_id).toBe("prod-xyz");
    expect(meta.product_setup_contract_schema_version).toBe("glovecubs.product_setup_contract.v1");
    expect(meta.import_has_product_setup_contract_summary).toBe(true);
    expect(meta.import_source_url).toBe("https://example.com/glove");
  });

  it("detects clipboard URL import metadata and blocks non-admin active status", () => {
    const meta = { import_staging_id: "staging-1" };
    expect(isClipboardUrlImportProductMetadata(meta)).toBe(true);
    expect(isCatalogosUrlImportProductMetadata(meta)).toBe(false);
    expect(clipboardUrlImportActiveStatusError(meta, "active")).toContain("admin review");
    expect(clipboardUrlImportActiveStatusError(meta, "active", { adminReviewPublish: true })).toBeNull();
    expect(clipboardUrlImportActiveStatusError(meta, "draft")).toBeNull();
  });

  it("detects CatalogOS extraction authority on metadata", () => {
    const meta = {
      import_staging_id: "staging-1",
      import_extraction_authority: CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS,
    };
    expect(isCatalogosUrlImportProductMetadata(meta)).toBe(true);
    expect(isUrlImportProductMetadata(meta)).toBe(true);
    expect(
      isCatalogosUrlImportProductMetadata({
        import_extraction_authority: CLIPBOARD_EXTRACTION_AUTHORITY_LOCAL,
      })
    ).toBe(false);
  });

  it("detects CatalogOS URL import job metadata without clipboard staging id", () => {
    const meta = { catalogos_url_import_job_id: "job-456" };
    expect(isClipboardUrlImportProductMetadata(meta)).toBe(false);
    expect(isUrlImportProductMetadata(meta)).toBe(true);
    expect(clipboardUrlImportActiveStatusError(meta, "active")).toContain("admin review");
  });
});
