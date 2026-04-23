/**
 * Tests for QuoteDetailRefreshButton.
 * Refresh behavior: button calls router.refresh() on click to re-fetch server data.
 */

import { describe, it, expect, vi } from "vitest";
import { QuoteDetailRefreshButton } from "./QuoteDetailRefreshButton";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("QuoteDetailRefreshButton", () => {
  it("is exported and is a function component", () => {
    expect(QuoteDetailRefreshButton).toBeDefined();
    expect(typeof QuoteDetailRefreshButton).toBe("function");
  });
});
