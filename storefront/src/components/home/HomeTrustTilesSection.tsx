import { Award, Warehouse, Truck, ClipboardCheck, FileText, UserRound } from "lucide-react";

const TILES = [
  { icon: Award, label: "Authorized Distributor" },
  { icon: Warehouse, label: "Consistent Inventory" },
  { icon: Truck, label: "Fast Fulfillment" },
  { icon: ClipboardCheck, label: "Spec-Based Recommendations" },
  { icon: FileText, label: "Net Terms Available" },
  { icon: UserRound, label: "Dedicated Account Support" },
] as const;

export function HomeTrustTilesSection() {
  return (
    <section className="border-t border-white/10 bg-gradient-to-b from-[#161616] to-[#0f0f0f] py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6 lg:gap-5">
          {TILES.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="rounded-xl border border-neutral-400/25 bg-neutral-100 p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition hover:-translate-y-0.5 hover:border-[#FF7A00]/40 hover:shadow-md"
            >
              <Icon className="mx-auto mb-3 h-10 w-10 text-[#FF7A00]" strokeWidth={2} aria-hidden />
              <div className="text-sm font-semibold leading-snug text-neutral-900">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
