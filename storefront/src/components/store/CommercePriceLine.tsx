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

export function RetailPriceStreak({ price, className }: { price: string; className?: string }) {
  return (
    <span className={cn("relative inline-block tabular-nums", className)}>
      {price}
      <span
        className="pointer-events-none absolute inset-x-[-2px] top-1/2 h-[2.5px] -translate-y-1/2 rotate-[-12deg] rounded-full bg-red-500"
        aria-hidden
      />
    </span>
  );
}

export function CommercePriceColumn({
  heading,
  listPrice,
  salePrice,
  onSale,
  unitLabel,
  light,
  className,
}: {
  heading: string;
  listPrice: number | null;
  salePrice: number | null;
  onSale: boolean;
  unitLabel: string;
  light?: boolean;
  className?: string;
}) {
  if (salePrice == null) return null;

  const muted = light ? "text-neutral-500" : "text-white/45";
  const strike = light ? "text-neutral-400" : "text-white/40";
  const saleClass = light ? "text-emerald-700" : "text-sales";
  const savings = onSale && listPrice != null ? listPrice - salePrice : null;

  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <p className={cn("text-[9px] font-bold uppercase tracking-wide", muted)}>{heading}</p>
      {onSale && listPrice != null ? (
        <div className="flex flex-wrap items-center gap-1">
          <RetailPriceStreak price={usd.format(listPrice)} className={cn("text-[10px] font-semibold", strike)} />
          <span
            className={cn(
              "rounded-full px-1 py-px text-[8px] font-bold uppercase tracking-wide",
              light ? "bg-emerald-100 text-emerald-800" : "bg-emerald-500/15 text-emerald-300"
            )}
          >
            Sale
          </span>
        </div>
      ) : null}
      <p className={cn("text-[15px] font-bold tabular-nums leading-none", saleClass)}>{usd.format(salePrice)}</p>
      <p className={cn("text-[9px] font-medium", muted)}>per {unitLabel}</p>
      {savings != null && savings > 0 ? (
        <span
          className={cn(
            "mt-0.5 inline-flex w-fit rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
            light ? "bg-emerald-50 text-emerald-700" : "bg-emerald-500/10 text-emerald-300"
          )}
        >
          Save {usd.format(savings)}
        </span>
      ) : null}
    </div>
  );
}

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
        <RetailPriceStreak
          price={usd.format(listPrice)}
          className={cn("font-semibold", strike, compact ? "text-[11px]" : "text-sm")}
        />
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
