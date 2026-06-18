import type { IngestionMode } from "./types";

export function modeLabel(mode: IngestionMode): string {
  return mode === "quick_draft" ? "Quick Draft" : "Deep Supplier Crawl";
}
