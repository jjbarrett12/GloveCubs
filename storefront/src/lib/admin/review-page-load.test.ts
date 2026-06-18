import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/admin/unified-ingestion-review-queue", () => ({
  fetchUnifiedReviewQueue: vi.fn(),
}));

vi.mock("@/lib/admin/clipboard-url-staging", () => ({
  listClipboardStaging: vi.fn(),
}));

vi.mock("@/lib/admin/product-form-options", () => ({
  fetchAdminCategoriesForProductForm: vi.fn(),
}));

import { isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchUnifiedReviewQueue } from "@/lib/admin/unified-ingestion-review-queue";
import { listClipboardStaging } from "@/lib/admin/clipboard-url-staging";
import { fetchAdminCategoriesForProductForm } from "@/lib/admin/product-form-options";
import { loadAdminProductsReviewPageData } from "@/lib/admin/review-page-load";

describe("loadAdminProductsReviewPageData", () => {
  beforeEach(() => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(fetchAdminCategoriesForProductForm).mockResolvedValue({
      rows: [{ id: "cat-1", name: "Gloves", slug: "gloves" }],
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty queues when Supabase is not configured", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    const result = await loadAdminProductsReviewPageData({ useUnifiedQueue: true });
    expect(result.unifiedRows).toEqual([]);
    expect(result.clipboardRows).toEqual([]);
    expect(result.queueError).toBeNull();
    expect(fetchUnifiedReviewQueue).not.toHaveBeenCalled();
  });

  it("renders with zero unified rows and no queue error", async () => {
    vi.mocked(fetchUnifiedReviewQueue).mockResolvedValue({ rows: [], error: null });
    const result = await loadAdminProductsReviewPageData({ useUnifiedQueue: true });
    expect(result.unifiedRows).toEqual([]);
    expect(result.queueError).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("surfaces canonical unified queue failure as admin-safe warning", async () => {
    vi.mocked(fetchUnifiedReviewQueue).mockResolvedValue({
      rows: [],
      error: {
        area: "unified_queue",
        code: "42P01",
        message: "relation catalog_v2.catalog_staging_variants does not exist",
      },
    });
    const result = await loadAdminProductsReviewPageData({ useUnifiedQueue: true });
    expect(result.queueError?.area).toBe("unified_queue");
    expect(result.queueError?.message).toContain("catalog_staging_variants");
  });

  it("keeps page usable when optional categories fail", async () => {
    vi.mocked(fetchUnifiedReviewQueue).mockResolvedValue({ rows: [], error: null });
    vi.mocked(fetchAdminCategoriesForProductForm).mockResolvedValue({
      rows: [],
      error: {
        area: "categories",
        code: "42501",
        message: "permission denied for table categories",
      },
    });
    const result = await loadAdminProductsReviewPageData({ useUnifiedQueue: true });
    expect(result.queueError).toBeNull();
    expect(result.warnings.some((w) => w.area === "categories")).toBe(true);
  });

  it("classifies clipboard queue failures when unified flag is off", async () => {
    vi.mocked(listClipboardStaging).mockResolvedValue({
      rows: [],
      error: {
        area: "clipboard_queue",
        code: "42501",
        message: "permission denied for table admin_url_clipboard_staging",
      },
    });
    const result = await loadAdminProductsReviewPageData({ useUnifiedQueue: false });
    expect(result.queueError?.area).toBe("clipboard_queue");
  });
});
