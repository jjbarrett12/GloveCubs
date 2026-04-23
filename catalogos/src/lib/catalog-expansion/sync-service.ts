/**
 * Catalog expansion sync orchestration: fetch feed, compare to prior, persist results.
 */

import { fetchFeed } from "@/lib/ingestion/fetch-feed";
import { parseFeed } from "@/lib/ingestion/parsers";
import type { ParsedRow } from "@/lib/ingestion/types";
import { externalIdFromRow, runComparison } from "./comparison";
import { loadPriorState } from "./prior-state";
import { createSyncRun, completeSyncRun, insertSyncItemResults } from "./sync-runs";
import type { SyncRunStats } from "./types";

export interface RunSyncInput {
  feedId: string;
  supplierId: string;
  feedUrl: string;
  config?: { auto_approve_safe?: boolean };
}

export interface RunSyncResult {
  runId: string;
  stats: SyncRunStats;
  error?: string;
}

/**
 * Run catalog expansion sync: compare current feed to prior batch; do not ingest raw rows.
 */
export async function runSync(input: RunSyncInput): Promise<RunSyncResult> {
  const { runId } = await createSyncRun({
    feedId: input.feedId,
    supplierId: input.supplierId,
    config: input.config,
  });

  const stats: SyncRunStats = {
    new_count: 0,
    changed_count: 0,
    unchanged_count: 0,
    missing_count: 0,
    error_count: 0,
  };

  try {
    const fetched = await fetchFeed({ url: input.feedUrl });
    if (!fetched.ok) {
      await completeSyncRun(runId, stats, `Feed fetch failed: HTTP ${fetched.status}`);
      return { runId, stats, error: `HTTP ${fetched.status}` };
    }

    const parsed = parseFeed(fetched);
    if (parsed.rowCount === 0) {
      const priorMap = await loadPriorState({ feedId: input.feedId, supplierId: input.supplierId });
      const currentRows: { external_id: string; row: ParsedRow }[] = [];
      const results = runComparison(currentRows, priorMap);
    for (const r of results) {
      if (r.result_type === "missing") stats.missing_count = (stats.missing_count ?? 0) + 1;
    }
    const currentRowMap = new Map<string, Record<string, unknown>>();
    await insertSyncItemResults(runId, results, input.supplierId, currentRowMap);
    await completeSyncRun(runId, stats);
      return { runId, stats };
    }

    const currentRows = parsed.rows.map((row, i) => ({
      external_id: externalIdFromRow(row, i),
      row,
    }));

    const priorByExternalId = await loadPriorState({ feedId: input.feedId, supplierId: input.supplierId });
    const results = runComparison(currentRows, priorByExternalId);

    for (const r of results) {
      if (r.result_type === "new") stats.new_count = (stats.new_count ?? 0) + 1;
      else if (r.result_type === "changed") stats.changed_count = (stats.changed_count ?? 0) + 1;
      else if (r.result_type === "unchanged") stats.unchanged_count = (stats.unchanged_count ?? 0) + 1;
      else if (r.result_type === "missing") stats.missing_count = (stats.missing_count ?? 0) + 1;
    }

    const currentRowMap = new Map<string, Record<string, unknown>>();
    for (const { external_id, row } of currentRows) {
      currentRowMap.set(external_id, row as Record<string, unknown>);
    }
    await insertSyncItemResults(runId, results, input.supplierId, currentRowMap);
    await completeSyncRun(runId, stats);
    return { runId, stats };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    stats.error_count = (stats.error_count ?? 0) + 1;
    await completeSyncRun(runId, stats, msg);
    return { runId, stats, error: msg };
  }
}
