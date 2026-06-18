import { MetricChip } from "./MetricChip";
import { adminCardSurface } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

type Props = {
  memberCount: number;
  quicklistCount: number;
  quoteCount: number;
  orderCount: number;
  lastActivityLabel: string;
};

export function CustomerDetailMetrics({
  memberCount,
  quicklistCount,
  quoteCount,
  orderCount,
  lastActivityLabel,
}: Props) {
  return (
    <div className="mb-6 flex flex-wrap gap-2 sm:gap-3">
      <MetricChip label="Team members" value={memberCount} />
      <MetricChip label="Preferred products" value={quicklistCount} />
      <MetricChip label="Quotes" value={quoteCount} />
      <MetricChip label="Orders" value={orderCount} />
      <div
        className={cn(
          adminCardSurface,
          "flex min-w-0 flex-1 basis-[14rem] flex-col justify-center px-3 py-2 sm:min-w-[10rem] sm:basis-auto",
        )}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-admin-muted">Last activity</span>
        <span className="mt-0.5 truncate text-sm font-semibold text-admin-primary" title={lastActivityLabel}>
          {lastActivityLabel}
        </span>
      </div>
    </div>
  );
}
