import { Badge } from "@/components/ui/badge";
import type { SearchPublishStatus } from "@/lib/publish/types";

const LABELS: Record<SearchPublishStatus, string> = {
  staged: "Staged",
  approved: "Approved (not published)",
  published_pending_sync: "Publishing…",
  published_synced: "Live & searchable",
  sync_failed: "Sync failed",
};

/** Admin indicator for public.canonical_products / storefront search alignment. */
export function SearchPublishStatusBadge({ status }: { status?: SearchPublishStatus | string | null }) {
  if (!status || status === "staged") return null;

  if (status === "approved") {
    return (
      <Badge variant="secondary" className="text-xs font-normal">
        {LABELS.approved}
      </Badge>
    );
  }
  if (status === "published_pending_sync") {
    return (
      <Badge variant="outline" className="text-xs font-normal border-amber-500/60 text-amber-700 dark:text-amber-400">
        {LABELS.published_pending_sync}
      </Badge>
    );
  }
  if (status === "published_synced") {
    return (
      <Badge variant="default" className="text-xs font-normal bg-emerald-700 hover:bg-emerald-700">
        {LABELS.published_synced}
      </Badge>
    );
  }
  if (status === "sync_failed") {
    return (
      <Badge variant="destructive" className="text-xs font-normal">
        {LABELS.sync_failed}
      </Badge>
    );
  }
  return null;
}
