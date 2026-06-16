import { cn } from "@/lib/utils";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

type Props = {
  listPrice: number | null;
  salePrice: number | null;
  onSale: boolean;
  unitLabel: string;
  compact?: boolean;
  light?: boolean;
  className?: string;
};

export function CommercePriceLine({
  listPrice,
  salePrice,
  onSale,
  unitLabel,
  compact,
  light,
  className,
}: Props) {
  if (salePrice == null) return null;

  const muted = light ? "text-neutral-500" : "text-white/45";
  const strike = light ? "text-neutral-400" : "text-white/40";
  const saleClass = light ? "text-emerald-700" : "text-sales";

  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      {onSale && listPrice != null ? (
        <span className={cn("font-semibold tabular-nums line-through", strike, compact ? "text-[11px]" : "text-sm")}>
          {usd.format(listPrice)}
        </span>
      ) : null}
      <span className={cn("font-bold tabular-nums", saleClass, compact ? "text-[13px]" : "text-base")}>
        {usd.format(salePrice)} / {unitLabel}
      </span>
      {onSale ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
            light ? "bg-emerald-100 text-emerald-800" : "bg-emerald-500/15 text-emerald-300"
          )}
        >
          Sale
        </span>
      ) : null}
      {onSale && listPrice != null && salePrice != null ? (
        <span className={cn("text-[10px] font-medium", muted)}>
          Save {usd.format(listPrice - salePrice)}
        </span>
      ) : null}
    </div>
  );
}

export { usd as commerceUsdFormatter };
