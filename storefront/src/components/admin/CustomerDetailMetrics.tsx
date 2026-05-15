import { MetricChip } from "./MetricChip";

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
      <div className="flex min-w-0 flex-1 basis-[14rem] flex-col justify-center rounded-lg border border-slate-200/90 bg-white px-3 py-2 shadow-sm sm:basis-auto sm:min-w-[10rem]">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Last activity</span>
        <span className="mt-0.5 truncate text-sm font-semibold text-slate-900" title={lastActivityLabel}>
          {lastActivityLabel}
        </span>
      </div>
    </div>
  );
}
