import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string | number;
  className?: string;
};

export function MetricChip({ label, value, className }: Props) {
  return (
    <div
      className={cn(
        "flex min-w-[5.5rem] flex-col rounded-lg border border-slate-200/90 bg-white px-3 py-2 shadow-sm",
        className,
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="mt-0.5 text-lg font-semibold tabular-nums leading-none text-slate-900">{value}</span>
    </div>
  );
}
