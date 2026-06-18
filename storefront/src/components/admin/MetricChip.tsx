import { adminCardSurface } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string | number;
  className?: string;
};

export function MetricChip({ label, value, className }: Props) {
  return (
    <div className={cn("flex min-w-[5.5rem] flex-col px-3 py-2", adminCardSurface, className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-admin-muted">{label}</span>
      <span className="mt-0.5 text-lg font-semibold tabular-nums leading-none text-admin-primary">{value}</span>
    </div>
  );
}
