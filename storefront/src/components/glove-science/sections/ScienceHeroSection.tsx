import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GLOVE_SCIENCE_HERO } from "@/config/gloveScienceHub";
import { cn } from "@/lib/utils";

const CALLOUT_POSITION: Record<
  (typeof GLOVE_SCIENCE_HERO.visualCallouts)[number]["position"],
  string
> = {
  "top-left": "left-[8%] top-[14%]",
  "top-right": "right-[8%] top-[18%]",
  "bottom-left": "left-[10%] bottom-[16%]",
  "bottom-right": "right-[10%] bottom-[14%]",
};

export function ScienceHeroSection() {
  const hero = GLOVE_SCIENCE_HERO;

  return (
    <section
      id={hero.sectionId}
      className="scroll-mt-24 border-b border-[#ebebea] bg-white"
      aria-labelledby="glove-science-hero-heading"
    >
      <div className="mx-auto max-w-proc px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14 xl:gap-16">
          <div className="min-w-0">
            <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-accent-orange)]">
              {hero.eyebrow}
            </p>
            <h1
              id="glove-science-hero-heading"
              className="proc-display-light mb-5 max-w-xl text-[2.35rem] sm:text-[2.75rem] lg:text-[3.1rem]"
            >
              {hero.headline}
            </h1>
            <p className="mb-8 max-w-lg text-[17px] leading-relaxed text-neutral-600 sm:text-lg">
              {hero.subheadline}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={hero.primaryCta.href} className="home-cta-primary inline-flex min-h-12 items-center rounded-xl px-7 py-3.5 text-sm font-bold">
                {hero.primaryCta.label}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Link>
              <Link
                href={hero.secondaryCta.href}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#d8d8d4] bg-white px-7 py-3.5 text-sm font-bold text-[#0a0a0a] transition hover:border-[var(--color-accent-orange)]/40"
              >
                {hero.secondaryCta.label}
              </Link>
            </div>
          </div>

          <div
            className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] shadow-[0_24px_60px_rgb(0_0_0/0.18)] lg:max-w-none lg:justify-self-end"
            aria-hidden
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#0a0a0a] to-[#141414]" />
            <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "24px 24px" }} />
            <div className="absolute left-1/2 top-1/2 h-[58%] w-[72%] -translate-x-1/2 -translate-y-[42%]">
              <div className="absolute inset-x-[18%] bottom-0 top-[22%] rounded-t-[3.5rem] rounded-b-2xl border border-white/15 bg-gradient-to-b from-[#1f1f1f] to-[#0d0d0d] shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]" />
              <div className="absolute left-[22%] right-[22%] top-[8%] h-[18%] rounded-t-[2rem] border border-t border-x border-white/10 bg-[#121212]" />
              <div className="absolute left-[28%] right-[28%] top-[24%] h-[3px] rounded-full bg-white/20" />
            </div>
            {hero.visualCallouts.map((callout) => (
              <span
                key={callout.id}
                className={cn(
                  "absolute z-[1] rounded-full border border-white/15 bg-[#111]/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80 backdrop-blur-sm",
                  CALLOUT_POSITION[callout.position]
                )}
              >
                <span className="mr-1.5 inline-block h-1 w-1 rounded-full bg-[var(--color-accent-orange)]" aria-hidden />
                {callout.label}
              </span>
            ))}
            <svg className="pointer-events-none absolute inset-0 h-full w-full text-white/12" aria-hidden>
              <line x1="22%" y1="28%" x2="32%" y2="22%" stroke="currentColor" strokeWidth="1" />
              <line x1="78%" y1="30%" x2="68%" y2="24%" stroke="currentColor" strokeWidth="1" />
              <line x1="24%" y1="72%" x2="34%" y2="78%" stroke="currentColor" strokeWidth="1" />
              <line x1="76%" y1="70%" x2="66%" y2="76%" stroke="currentColor" strokeWidth="1" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
