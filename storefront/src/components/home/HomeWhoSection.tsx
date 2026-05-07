import type { ReactNode } from "react";
import Link from "next/link";
import { Droplets, UtensilsCrossed, Stethoscope, Factory } from "lucide-react";
import { BrandCarousel } from "@/components/home/BrandCarousel";

function IndustryIcon({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-200 text-neutral-700"
      aria-hidden
    >
      {children}
    </div>
  );
}

export function HomeWhoSection() {
  return (
    <section
      id="industries"
      className="scroll-mt-28 border-t border-neutral-200/80 bg-gradient-to-b from-[#f3f4f6] to-white py-20 pb-24"
      aria-labelledby="who-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 id="who-heading" className="mb-3 text-3xl font-extrabold tracking-tight text-neutral-900 md:text-4xl">
            Built for teams that buy gloves by the case
          </h2>
          <p className="mx-auto max-w-xl text-base leading-relaxed text-neutral-600 md:text-[17px]">
            Operators, facilities leads, and front-line managers—not consumer checkout.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/industries/janitorial"
            className="block rounded-2xl border border-neutral-300/90 bg-white p-7 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:-translate-y-0.5 hover:border-[#f06232]/60 hover:shadow-md"
          >
            <IndustryIcon>
              <Droplets className="h-6 w-6" strokeWidth={2} />
            </IndustryIcon>
            <h3 className="mb-2.5 text-lg font-bold text-neutral-900">Janitorial Contractors</h3>
            <p className="m-0 text-sm leading-snug text-neutral-600">Reduce cost per building. Standardize SKUs.</p>
            <span className="mt-3.5 inline-block text-sm font-semibold text-[#f06232]">View industry page →</span>
          </Link>
          <Link
            href="/industries/hospitality"
            className="block rounded-2xl border border-neutral-300/90 bg-white p-7 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:-translate-y-0.5 hover:border-[#f06232]/60 hover:shadow-md"
          >
            <IndustryIcon>
              <UtensilsCrossed className="h-6 w-6" strokeWidth={2} />
            </IndustryIcon>
            <h3 className="mb-2.5 text-lg font-bold text-neutral-900">Hospitality</h3>
            <p className="m-0 text-sm leading-snug text-neutral-600">Food-safe vinyl &amp; nitrile at competitive case pricing.</p>
            <span className="mt-3.5 inline-block text-sm font-semibold text-[#f06232]">View industry page →</span>
          </Link>
          <Link
            href="/industries/healthcare"
            className="block rounded-2xl border border-neutral-300/90 bg-white p-7 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:-translate-y-0.5 hover:border-[#f06232]/60 hover:shadow-md"
          >
            <IndustryIcon>
              <Stethoscope className="h-6 w-6" strokeWidth={2} />
            </IndustryIcon>
            <h3 className="mb-2.5 text-lg font-bold text-neutral-900">Healthcare</h3>
            <p className="m-0 text-sm leading-snug text-neutral-600">Medical-grade compliance with reliable stock.</p>
            <span className="mt-3.5 inline-block text-sm font-semibold text-[#f06232]">View industry page →</span>
          </Link>
          <Link
            href="/industries/industrial"
            className="block rounded-2xl border border-neutral-300/90 bg-white p-7 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:-translate-y-0.5 hover:border-[#f06232]/60 hover:shadow-md"
          >
            <IndustryIcon>
              <Factory className="h-6 w-6" strokeWidth={2} />
            </IndustryIcon>
            <h3 className="mb-2.5 text-lg font-bold text-neutral-900">Industrial &amp; Manufacturing</h3>
            <p className="m-0 text-sm leading-snug text-neutral-600">Cut-resistant, chemical, and task-specific gloves at scale.</p>
            <span className="mt-3.5 inline-block text-sm font-semibold text-[#f06232]">View industry page →</span>
          </Link>
        </div>
        <BrandCarousel />
      </div>
    </section>
  );
}
