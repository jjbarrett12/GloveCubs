import { cn } from "@/lib/utils";

/** High-res design asset from `public/images/glovecubs network.png` (1691×930) */
const SUPPLIER_COMPARISON_ART = "/images/procurement/glovecubs-network-comparison.png";

export function HomeSupplierNetworkComparison({ className }: { className?: string }) {
  return (
    <figure className={cn("relative m-0 mx-auto w-full min-w-0 max-w-4xl", className)}>
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-[#ebebea] bg-white shadow-[0_4px_24px_rgb(0_0_0/0.06)] sm:aspect-[16/9] lg:max-h-[min(520px,70vh)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={SUPPLIER_COMPARISON_ART}
          alt="Single supplier contract versus GloveCubs network approach: one source high risk compared with multi-supplier resilience and operational continuity"
          width={1691}
          height={930}
          decoding="async"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-contain object-center p-1 sm:p-2"
        />
      </div>
    </figure>
  );
}
