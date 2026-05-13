import type { NormalizedUrlImportStatus } from "@/lib/admin/url-import-adapter";
import { StatusBadge } from "@/components/admin";

const MAP: Record<NormalizedUrlImportStatus, { variant: string; label: string }> = {
  queued: { variant: "pending", label: "Queued" },
  running: { variant: "running", label: "Running" },
  completed: { variant: "completed", label: "Completed" },
  failed: { variant: "failed", label: "Failed" },
  canceled: { variant: "cancelled", label: "Canceled" },
  unknown: { variant: "neutral", label: "Unknown" },
};

export function ImportStatusBadge({
  status,
  rawStatus,
}: {
  status: NormalizedUrlImportStatus;
  rawStatus?: string;
}) {
  const m = MAP[status] ?? MAP.unknown;
  const showRaw = status === "unknown" && rawStatus && rawStatus.trim().length > 0;
  return (
    <span className="inline-flex items-center gap-1" title={rawStatus || m.label}>
      <StatusBadge status={m.variant} dot />
      {showRaw ? <span className="font-mono text-[10px] text-neutral-500">({rawStatus})</span> : null}
    </span>
  );
}
