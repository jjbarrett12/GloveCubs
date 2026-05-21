"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ProcurementSectionShell, SectionEyebrow } from "@/components/procurement";
import { HOME_FAQ_CATEGORIES } from "@/config/homeAuthority";
import { HomePanelLight } from "@/components/home/authority/HomeAuthorityPrimitives";
import { cn } from "@/lib/utils";

function faqSlug(category: string, question: string): string {
  return `${category}-${question}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function HomeFaqSection() {
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const [activeCategory, setActiveCategory] = React.useState(HOME_FAQ_CATEGORIES[0].category);

  const activeGroup = HOME_FAQ_CATEGORIES.find((c) => c.category === activeCategory);
  const categoryPanelId = `faq-category-${faqSlug(activeCategory, "panel")}`;

  return (
    <ProcurementSectionShell
      tone="light"
      headingId="home-faq-heading"
      ariaLabel="Frequently asked questions"
      className="!py-16 sm:!py-20"
      containerClassName="flex flex-col items-center"
    >
      <header className="home-intro mb-12 w-full max-w-3xl text-center sm:mb-14 lg:mb-16">
        <SectionEyebrow tone="light" className="mb-4 justify-center !text-[var(--color-accent-orange)]">
          FAQ.
        </SectionEyebrow>
        <h2 id="home-faq-heading" className="proc-display-light mx-auto mb-4 max-w-4xl">
          Answers for serious buyers
          <span className="text-[var(--color-accent-orange)]">.</span>
        </h2>
        <p className="proc-body-light mx-auto max-w-2xl text-[17px]">
          Procurement, specs, fulfillment, and invoice workflows—aligned with how we actually operate.
        </p>
      </header>

      <div role="radiogroup" aria-label="FAQ categories" className="mb-8 flex w-full max-w-3xl flex-wrap justify-center gap-2">
        {HOME_FAQ_CATEGORIES.map(({ category }) => (
          <button
            key={category}
            type="button"
            role="radio"
            aria-checked={activeCategory === category}
            onClick={() => {
              setActiveCategory(category);
              setOpenKey(null);
            }}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-orange)] focus-visible:ring-offset-2",
              activeCategory === category
                ? "bg-[var(--color-accent-orange)] text-[#0a0a0a] shadow-[0_4px_16px_rgb(255_106_0/0.28)]"
                : "bg-[var(--color-industrial-gray)] text-neutral-600 hover:text-[var(--color-accent-orange)]"
            )}
          >
            {category}
          </button>
        ))}
      </div>

      <HomePanelLight
        id={categoryPanelId}
        className="w-full max-w-3xl overflow-hidden"
        role="region"
        aria-label={`${activeCategory} questions`}
      >
        <ul>
          {activeGroup?.items.map((item) => {
            const key = `${activeCategory}-${item.q}`;
            const open = openKey === key;
            const slug = faqSlug(activeCategory, item.q);
            const buttonId = `faq-btn-${slug}`;
            const answerId = `faq-answer-${slug}`;

            return (
              <li key={key} className="border-b border-[#ebebea] last:border-0">
                <button
                  id={buttonId}
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-[#fafaf8] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent-orange)] sm:px-7 sm:py-6"
                  aria-expanded={open}
                  aria-controls={answerId}
                  onClick={() => setOpenKey(open ? null : key)}
                >
                  <span className="pr-4 text-base font-semibold leading-snug text-[var(--color-accent-orange)] sm:text-[17px]">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 shrink-0 text-[var(--color-accent-orange)]/55 transition-transform duration-200",
                      open && "rotate-180 text-[var(--color-accent-orange)]"
                    )}
                    aria-hidden
                  />
                </button>
                <div id={answerId} role="region" aria-labelledby={buttonId} hidden={!open}>
                  <p className="border-t border-[#f0f0ee] px-5 pb-6 pt-0 text-[15px] leading-relaxed text-text-muted-light sm:px-7 sm:pb-6 sm:pt-4">
                    {item.a}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </HomePanelLight>

      <p className="mt-8 max-w-3xl text-center text-sm text-text-muted-light">
        More on the{" "}
        <Link href="/faq" className="font-semibold text-[var(--color-accent-orange)] hover:underline">
          full FAQ page
        </Link>
        .
      </p>
    </ProcurementSectionShell>
  );
}
