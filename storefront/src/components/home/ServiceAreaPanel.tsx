import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";

export function ServiceAreaPanel() {
  return (
    <section className="py-10">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-4 flex-1">
            <h2 className="text-xl font-semibold text-white">Fulfillment & service area</h2>
            <ul className="space-y-2 text-white/75 text-sm">
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
                <span>Salt Lake City</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
                <span>Kansas City</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
                <span>Nationwide shipping</span>
              </li>
            </ul>
          </div>
          <div className="hidden lg:block h-32 w-full max-w-md rounded-xl border border-white/10 bg-[repeating-linear-gradient(90deg,transparent,transparent_8px,rgba(255,255,255,0.06)_8px,rgba(255,255,255,0.06)_9px)] relative overflow-hidden shrink-0">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs uppercase tracking-wider text-white/35">Route / warehouse coverage</span>
            </div>
          </div>
          <div className="lg:self-center shrink-0">
            <Button asChild size="lg" className="bg-[hsl(var(--primary))] text-white hover:opacity-90 w-full sm:w-auto">
              <Link href="/request-pricing">Check service availability</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
