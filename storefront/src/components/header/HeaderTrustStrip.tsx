import { Check } from "lucide-react";

const TRUST_ITEMS = [
  "Dedicated procurement reps",
  "Net terms for qualified buyers",
  "Case & pallet programs",
  "Fast nationwide fulfillment",
] as const;

export function HeaderTrustStrip() {
  return (
    <div
      className="hidden border-t border-neutral-300/40 bg-[#f0f0ec]/60 px-4 py-1 sm:px-6 xl:block xl:px-8"
      aria-label="Procurement capabilities"
    >
      <ul className="mx-auto flex max-w-7xl list-none flex-wrap items-center justify-center gap-x-3 gap-y-0 text-[9px] font-medium tracking-wide text-neutral-500 xl:gap-x-4 xl:text-[10px]">
        {TRUST_ITEMS.map((item) => (
          <li key={item} className="inline-flex items-center gap-1">
            <Check className="h-2.5 w-2.5 shrink-0 text-neutral-400" strokeWidth={2.5} aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
