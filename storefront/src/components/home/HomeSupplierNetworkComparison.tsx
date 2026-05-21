import { cn } from "@/lib/utils";

/** High-res design asset from `public/images/glovecubs network.png` (1691×930) */
const SUPPLIER_COMPARISON_ART = "/images/procurement/glovecubs-network-comparison.png";

const FIGURE_BLEED =
  "relative m-0 min-w-0 w-[calc(100%+2rem)] max-w-none -mx-4 sm:w-[calc(100%+2.5rem)] sm:-mx-5 lg:w-[calc(100%+3rem)] lg:-mx-6";

export function HomeSupplierNetworkComparison({ className }: { className?: string }) {
  return (
    <figure className={cn(FIGURE_BLEED, className)}>
      {/* Full width, natural height — no max-h cap so infographic text stays legible */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SUPPLIER_COMPARISON_ART}
        alt="Single supplier contract versus GloveCubs network approach: one source high risk compared with multi-supplier resilience and operational continuity"
        width={1691}
        height={930}
        decoding="async"
        loading="lazy"
        className="block h-auto w-full max-w-none rounded-xl border border-[#ebebea] bg-white shadow-[0_4px_24px_rgb(0_0_0/0.06)]"
      />
    </figure>
  );
}
