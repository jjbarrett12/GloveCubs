import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Droplets, UtensilsCrossed, Stethoscope, Factory } from "lucide-react";
import { BrandCarousel } from "@/components/home/BrandCarousel";
import { cn } from "@/lib/utils";

const INDUSTRIES = [
  {
    href: "/industries/janitorial",
    icon: Droplets,
    title: "Janitorial Contractors",
    body: "Reduce cost per building. Standardize SKUs.",
  },
  {
    href: "/industries/hospitality",
    icon: UtensilsCrossed,
    title: "Hospitality",
    body: "Food-safe vinyl & nitrile at competitive case pricing.",
  },
  {
    href: "/industries/healthcare",
    icon: Stethoscope,
    title: "Healthcare",
    body: "Medical-grade compliance with reliable stock.",
  },
  {
    href: "/industries/industrial",
    icon: Factory,
    title: "Industrial & Manufacturing",
    body: "Cut-resistant, chemical, and task-specific gloves at scale.",
  },
] as const;

function IndustryIconWrap({ children }: { children: ReactNode }) {
  return (
    <span className="mx-auto mb-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border-light bg-[#fafafa] text-neutral-700">
      {children}
    </span>
  );
}

type HomeWhoSectionProps = {
  /** Render inside HomeIndustriesTrustSection (no outer section shell). */
  embedded?: boolean;
};

export function HomeWhoSection({ embedded = false }: HomeWhoSectionProps) {
  const inner = (
    <>
      <div className={cn("mb-10 text-center", embedded ? "pt-10" : "")}>
        <h2 id="who-heading" className="mb-3 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          Shop where gloves get used
        </h2>
        <p className="mx-auto max-w-xl text-base leading-relaxed text-text-muted-light md:text-[17px]">
          Industry pages connect operating context to catalog entry points—still B2B commerce, not a software tour.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {INDUSTRIES.map(({ href, icon: Icon, title, body }) => (
          <Link
            key={href}
            href={href}
            className="group flex h-full flex-col items-center rounded-xl border border-border-light bg-white p-5 text-center shadow-proc-light-sm transition hover:border-brand/40 hover:shadow-proc-light-md"
          >
            <IndustryIconWrap>
              <Icon className="h-5 w-5 text-brand" strokeWidth={2} aria-hidden />
            </IndustryIconWrap>
            <h3 className="mb-2 text-lg font-bold text-ink">{title}</h3>
            <p className="m-0 flex-1 text-sm leading-snug text-text-muted-light">{body}</p>
            <span className="mt-3 inline-flex items-center justify-center gap-1 text-sm font-semibold text-brand">
              View industry page
              <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        ))}
      </div>
      <BrandCarousel />
    </>
  );

  if (embedded) {
    return (
      <div id="industries" className="scroll-mt-28">
        {inner}
      </div>
    );
  }

  return (
    <section
      id="industries"
      className="scroll-mt-28 border-t border-border-light bg-white py-20 pb-24"
      aria-labelledby="who-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{inner}</div>
    </section>
  );
}
