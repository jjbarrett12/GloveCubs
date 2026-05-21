"use client";

import Link from "next/link";
import { ArrowRight, MoreHorizontal } from "lucide-react";
import { ProcurementSectionShell } from "@/components/procurement";
import { industryNavIconForHref } from "@/config/industryNavIcons";
import {
  buildHomeBottomIconRow,
  buildHomeFeaturedIndustries,
  homeIndustryCatalogCount,
  homeIndustryOverflowCount,
  HOME_INDUSTRY_TRUST_PILLARS,
  type HomeIndustryFeatured,
} from "@/config/homeIndustryIntelligence";
import { cn } from "@/lib/utils";

const FEATURED_INDUSTRIES = buildHomeFeaturedIndustries();
const FEATURED_TOP = FEATURED_INDUSTRIES.slice(0, 6);
const FEATURED_BOTTOM = FEATURED_INDUSTRIES.slice(6, 12);
const BOTTOM_ICON_ROW = buildHomeBottomIconRow();
const INDUSTRY_COUNT = homeIndustryCatalogCount();
const OVERFLOW_COUNT = homeIndustryOverflowCount();

/** Interlocking chevron — left tip on first tile; notch + right tip on linked tiles. */
const CHEVRON_CLIP_FIRST =
  "polygon(0 50%, 22px 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 22px 100%)";
const CHEVRON_CLIP_LINKED =
  "polygon(22px 50%, 22px 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 22px 100%)";
const CHEVRON_CLIP_LAST = "polygon(22px 50%, 22px 0, 100% 0, 100% 100%, 22px 100%)";

const INDUSTRY_IMAGE_FALLBACK =
  "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&h=900&q=82";

function chevronClipForIndex(index: number, total: number): string {
  if (index === 0) return CHEVRON_CLIP_FIRST;
  if (index === total - 1) return CHEVRON_CLIP_LAST;
  return CHEVRON_CLIP_LINKED;
}

function FeaturedChevronCard({
  card,
  chevronIndex,
  chevronTotal,
  variant = "chevron",
}: {
  card: HomeIndustryFeatured;
  chevronIndex?: number;
  chevronTotal?: number;
  variant?: "chevron" | "tile";
}) {
  const Icon = industryNavIconForHref(card.href);
  const isChevron = variant === "chevron";
  const isFirstInRow = chevronIndex === 0;
  const isLastInRow = chevronIndex !== undefined && chevronTotal !== undefined && chevronIndex === chevronTotal - 1;

  return (
    <Link
      href={card.href}
      role="listitem"
      style={
        isChevron && chevronIndex !== undefined && chevronTotal !== undefined
          ? { clipPath: chevronClipForIndex(chevronIndex, chevronTotal) }
          : undefined
      }
      className={cn(
        "group relative flex min-h-[152px] flex-col overflow-hidden bg-[#141414] outline-none sm:min-h-[162px] lg:min-h-[180px]",
        isChevron
          ? cn("h-full min-w-0 flex-1", !isFirstInRow && "-ml-[16px] xl:-ml-[18px]")
          : "rounded-xl border border-white/[0.08]",
        "motion-safe:transition motion-safe:duration-300",
        "motion-safe:hover:brightness-[1.03]",
        "focus-visible:ring-2 focus-visible:ring-[var(--color-accent-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]",
      )}
    >
      <div className="absolute inset-0" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- remote placeholders until brand industry art ships */}
        <img
          src={card.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn(
            "h-full w-full object-cover brightness-[0.95] contrast-[1.08] saturate-[1.18]",
            "motion-safe:transition motion-safe:duration-500 motion-safe:group-hover:scale-[1.03] motion-safe:group-hover:saturate-[1.25]",
            card.imagePosition,
          )}
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src !== INDUSTRY_IMAGE_FALLBACK) img.src = INDUSTRY_IMAGE_FALLBACK;
          }}
        />
        <div className="absolute inset-0 bg-[#0a0a0a]/18" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/45 via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[52%] bg-gradient-to-t from-[#0a0a0a]/88 via-[#0a0a0a]/45 to-transparent" />
      </div>

      <div
        className={cn(
          "relative flex h-full flex-col pb-4 pt-4 sm:pb-5 sm:pt-5",
          isChevron
            ? cn(
                "pl-5 sm:pl-6",
                isLastInRow ? "pr-5 sm:pr-6" : "pr-[2.75rem] sm:pr-14",
              )
            : "px-4 sm:px-5",
        )}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/30 bg-black/25 shadow-[0_4px_16px_rgb(0_0_0/0.35)] backdrop-blur-[2px]"
          aria-hidden
        >
          <Icon className="h-4 w-4 text-white drop-shadow-md" strokeWidth={2} />
        </div>
        <div className="mt-auto max-w-[92%] min-w-0 [text-shadow:0_1px_10px_rgb(0_0_0/0.75)]">
          <h3 className="text-[14px] font-bold leading-snug text-white sm:text-[15px]">{card.title}</h3>
          <p className="mt-1.5 text-[11px] leading-[1.35] text-white/90 sm:text-xs">{card.descriptor}</p>
        </div>
        <span
          className={cn(
            "absolute bottom-4 inline-flex h-8 w-8 items-center justify-center rounded-full",
            isLastInRow ? "right-4" : "right-3 sm:right-4",
            "border border-white/35 bg-black/40 text-white shadow-[0_4px_14px_rgb(0_0_0/0.4)] backdrop-blur-sm",
            "motion-safe:transition group-hover:border-[var(--color-accent-orange)] group-hover:bg-[var(--color-accent-orange)]",
          )}
          aria-hidden
        >
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}

function ChevronRow({ cards }: { cards: HomeIndustryFeatured[] }) {
  return (
    <>
      <div role="list" className="hidden w-full lg:flex">
        {cards.map((card, index) => (
          <FeaturedChevronCard
            key={card.href}
            card={card}
            chevronIndex={index}
            chevronTotal={cards.length}
            variant="chevron"
          />
        ))}
      </div>
      <div role="list" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:hidden">
        {cards.map((card) => (
          <FeaturedChevronCard key={card.href} card={card} variant="tile" />
        ))}
      </div>
    </>
  );
}

function BottomIndustryIcon({ href, label }: { href: string; label: string }) {
  const Icon = industryNavIconForHref(href);

  return (
    <Link
      href={href}
      className={cn(
        "group flex min-w-[88px] max-w-[120px] flex-1 flex-col items-center gap-2 px-2 text-center outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--color-accent-orange)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]",
      )}
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white/70 transition group-hover:border-white/30 group-hover:text-white"
        aria-hidden
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span className="text-[11px] font-medium leading-snug text-white/65 transition group-hover:text-white sm:text-xs">
        {label}
      </span>
      <ArrowRight className="h-3 w-3 text-white/35 transition group-hover:text-[var(--color-accent-orange)]" aria-hidden />
    </Link>
  );
}

export function HomeIndustrySolutionsSection() {
  const overflowLabel =
    OVERFLOW_COUNT >= 10 ? "And 10+ more" : OVERFLOW_COUNT > 0 ? `And ${OVERFLOW_COUNT} more` : null;

  return (
    <ProcurementSectionShell
      tone="base"
      headingId="industry-intelligence-heading"
      ariaLabel="Industries we serve"
      className="home-authority-grid proc-section-dark relative overflow-hidden !py-16 sm:!py-20 lg:!py-24"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_0%,rgba(255,106,0,0.09)_0%,transparent_60%)]"
        aria-hidden
      />

      <header className="relative mx-auto mb-10 max-w-4xl text-center sm:mb-12 lg:mb-14">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-accent-orange)]">
          Industries we serve
        </p>
        <h2
          id="industry-intelligence-heading"
          className="mt-4 text-[2rem] font-black leading-[1.05] tracking-tight text-white sm:text-[2.65rem] lg:text-[3rem]"
        >
          30+ industries. Every risk covered
          <span className="text-[var(--color-accent-orange)]">.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-white/58 sm:text-base">
          Different environments. Different hazards. Same commitment to protection.
        </p>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-white/58 sm:text-base">
          Explore disposable and reusable glove solutions purpose-built for how you work.
        </p>

        <ul className="m-0 mt-10 grid list-none grid-cols-1 gap-6 p-0 text-left sm:grid-cols-2 lg:mt-12 lg:grid-cols-4 lg:gap-8">
          {HOME_INDUSTRY_TRUST_PILLARS.map(({ title, description, icon: Icon }) => (
            <li key={title} className="flex gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-accent-orange)]/30 bg-[var(--color-accent-orange)]/[0.08]"
                aria-hidden
              >
                <Icon className="h-4 w-4 text-[var(--color-accent-orange)]" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white/90">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/50">{description}</p>
              </div>
            </li>
          ))}
        </ul>
      </header>

      <div className="relative w-full min-w-0" aria-label="Featured industries by environment">
        <div className="flex w-full flex-col gap-2.5 sm:gap-3">
          <ChevronRow cards={FEATURED_TOP} />
          <ChevronRow cards={FEATURED_BOTTOM} />
        </div>
      </div>

      <div className="relative mt-12 sm:mt-14">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-center gap-y-6 sm:gap-x-1">
          {BOTTOM_ICON_ROW.map((item) => (
            <BottomIndustryIcon key={item.href} href={item.href} label={item.label} />
          ))}
          {overflowLabel ? (
            <Link
              href="/industries"
              className={cn(
                "group flex min-w-[88px] max-w-[120px] flex-1 flex-col items-center gap-2 px-2 text-center outline-none",
                "focus-visible:ring-2 focus-visible:ring-[var(--color-accent-orange)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]",
              )}
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white/70 transition group-hover:border-white/30 group-hover:text-white"
                aria-hidden
              >
                <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="text-[11px] font-medium leading-snug text-white/65 transition group-hover:text-white sm:text-xs">
                {overflowLabel}
              </span>
              <ArrowRight className="h-3 w-3 text-white/35 transition group-hover:text-[var(--color-accent-orange)]" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>

      <div className="relative mt-12 flex justify-center sm:mt-14">
        <Link
          href="/industries"
          className={cn(
            "inline-flex min-h-12 items-center gap-2 rounded-full border border-[var(--color-accent-orange)]/70 bg-transparent px-8 py-3",
            "text-sm font-bold text-[var(--color-accent-orange)] transition duration-200",
            "hover:border-[var(--color-accent-orange)] hover:bg-[var(--color-accent-orange)]/[0.1]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]",
          )}
        >
          View all {INDUSTRY_COUNT} industries
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </ProcurementSectionShell>
  );
}
