import { describe, expect, it } from "vitest";
import {
  classifyReviewFetchError,
  sanitizeReviewFetchMessage,
} from "@/lib/admin/review-fetch-errors";

describe("sanitizeReviewFetchMessage", () => {
  it("redacts messages that look like secrets", () => {
    expect(sanitizeReviewFetchMessage("service_role key eyJabc.def.ghi is invalid")).toBe(
      "Review data could not be loaded."
    );
    expect(sanitizeReviewFetchMessage("password=super-secret")).toBe("Review data could not be loaded.");
  });

  it("keeps safe operator-facing errors", () => {
    expect(sanitizeReviewFetchMessage("permission denied for table catalog_staging_variants")).toBe(
      "permission denied for table catalog_staging_variants"
    );
  });
});

describe("classifyReviewFetchError", () => {
  it("classifies unified queue failures without leaking secrets", () => {
    const warning = classifyReviewFetchError(
      "unified_queue",
      new Error("service_role invalid for catalog_v2.ingestion_jobs")
    );
    expect(warning.area).toBe("unified_queue");
    expect(warning.code).toBe("fetch_failed");
    expect(warning.message).toBe("Review data could not be loaded.");
  });

  it("classifies clipboard and category areas", () => {
    expect(classifyReviewFetchError("clipboard_queue", "relation missing").area).toBe("clipboard_queue");
    expect(classifyReviewFetchError("categories", "relation missing").area).toBe("categories");
  });
});
