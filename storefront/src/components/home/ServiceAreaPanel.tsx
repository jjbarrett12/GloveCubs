import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";

const MAP_EMBED_URL = process.env.NEXT_PUBLIC_HOME_MAP_EMBED_URL?.trim() ?? "";

export function ServiceAreaPanel() {
  return (
    <section className="border-t border-white/10 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Built here but servicing everywhere.
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-white/55">
          Hubs in Salt Lake City and Kansas City with nationwide shipping for case and program orders.
        </p>

        <div className="mt-10 flex flex-col gap-8 lg:flex-row lg:items-stretch lg:gap-10">
          <div className="flex flex-1 flex-col justify-center space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <ul className="space-y-3 text-sm text-white/80">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
                <span>
                  <span className="font-semibold text-white">Salt Lake City</span>
                  <span className="block text-white/50">Distribution &amp; support</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
                <span>
                  <span className="font-semibold text-white">Kansas City</span>
                  <span className="block text-white/50">Regional fulfillment</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
                <span>
                  <span className="font-semibold text-white">Nationwide shipping</span>
                  <span className="block text-white/50">Business &amp; job-site delivery</span>
                </span>
              </li>
            </ul>
            <Button
              asChild
              size="lg"
              className="mt-4 w-full bg-[hsl(var(--primary))] text-white hover:opacity-90 sm:w-auto lg:mt-6"
            >
              <Link href="/request-pricing">Check service availability</Link>
            </Button>
          </div>

          <div className="relative min-h-[220px] flex-1 overflow-hidden rounded-xl border border-white/10 bg-[hsl(222_47%_5%)] lg:min-h-[280px]">
            {MAP_EMBED_URL ? (
              <iframe
                title="Service area map"
                src={MAP_EMBED_URL}
                className="absolute inset-0 h-full w-full border-0 grayscale contrast-125"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col">
                <div className="flex-1 bg-[repeating-linear-gradient(90deg,transparent,transparent_10px,rgba(255,255,255,0.04)_10px,rgba(255,255,255,0.04)_11px)]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_50%_50%,hsl(var(--primary))/12,transparent_70%)]" />
                <div className="relative flex flex-1 items-center justify-center gap-8 px-6">
                  <span className="flex h-3 w-3 rounded-full bg-[hsl(var(--primary))] shadow-lg shadow-[hsl(var(--primary))]/40 ring-4 ring-[hsl(var(--primary))]/20" title="Salt Lake City" />
                  <span className="flex h-3 w-3 rounded-full bg-white/50 ring-4 ring-white/10" title="Kansas City" />
                </div>
                <p className="relative z-10 border-t border-white/10 bg-black/50 px-4 py-2 text-center text-xs uppercase tracking-wider text-white/40">
                  Route &amp; coverage overview
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
