import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProcurementSectionShell } from "@/components/procurement";
import { HOME_INDUSTRY_SOLUTIONS } from "@/config/homeAuthority";
import { HomeSectionIntro } from "@/components/home/authority/HomeAuthorityPrimitives";
import { cn } from "@/lib/utils";

export function HomeIndustrySolutionsSection() {
  return (
    <ProcurementSectionShell
      tone="light"
      headingId="industry-solutions-heading"
      ariaLabel="Industry solutions"
      className="proc-section-light !py-16 sm:!py-20"
    >
      <HomeSectionIntro
        headingId="industry-solutions-heading"
        eyebrow="Category expertise"
        title="Glove programs built for how you operate"
        description="Operational pain, governed glove classes, and procurement language—by environment, not generic catalog tiles."
        tone="light"
      />

      <div className="space-y-0">
        {HOME_INDUSTRY_SOLUTIONS.map((item, index) => {
          const layout = index % 3;

          if (layout === 1) {
            return (
              <article key={item.key} className="home-industry-rule">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
                  <div className="lg:max-w-[55%]">
                    <p className="mb-2 font-mono text-xs uppercase tracking-widest text-neutral-400">{item.name}</p>
                    <h3 className="mb-3 text-xl font-extrabold tracking-tight text-ink sm:text-2xl">{item.pain}</h3>
                    <p className="text-[15px] leading-relaxed text-text-muted-light">{item.education}</p>
                  </div>
                  <div className="lg:max-w-[40%] lg:text-right">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-500">Glove classes</p>
                    <p className="text-base font-semibold leading-snug text-ink">{item.gloveClasses}</p>
                    <Link
                      href={item.href}
                      className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[var(--color-accent-orange)] hover:gap-3"
                    >
                      View path
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                </div>
              </article>
            );
          }

          if (layout === 2) {
            return (
              <article
                key={item.key}
                className="home-industry-rule border-l-4 border-[var(--color-accent-orange)] bg-[var(--color-industrial-gray)] px-6 py-8 sm:px-10 sm:py-10"
              >
                <h3 className="mb-2 text-2xl font-extrabold text-ink">{item.name}</h3>
                <p className="mb-3 max-w-2xl text-[15px] font-medium text-neutral-800">{item.pain}</p>
                <p className="mb-4 max-w-2xl text-[15px] text-text-muted-light">{item.education}</p>
                <p className="mb-5 text-sm font-semibold text-ink">{item.gloveClasses}</p>
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-2 text-sm font-bold text-[var(--color-accent-orange)]"
                >
                  Explore {item.name.toLowerCase()}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </article>
            );
          }

          const imageFirst = index % 2 === 0;
          return (
            <article
              key={item.key}
              className={cn("home-industry-rule grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-14", !imageFirst && "lg:[&>div:first-child]:order-2")}
            >
              <div
                className={cn(
                  "relative flex min-h-[220px] flex-col justify-end overflow-hidden rounded-xl p-6 sm:min-h-[260px]",
                  item.imageTone === "dark"
                    ? "bg-[#141414] text-white"
                    : "bg-[#ececea] text-ink"
                )}
                aria-hidden
              >
                <div
                  className={cn(
                    "absolute inset-0",
                    item.imageTone === "dark"
                      ? "bg-[radial-gradient(circle_at_80%_20%,rgba(255,106,0,0.18)_0%,transparent_55%)]"
                      : "bg-[radial-gradient(circle_at_20%_80%,rgba(255,106,0,0.1)_0%,transparent_50%)]"
                  )}
                />
                <p className={cn("relative text-[11px] font-bold uppercase tracking-[0.12em]", item.imageTone === "dark" ? "text-white/45" : "text-neutral-500")}>
                  Recommended classes
                </p>
                <p className="relative mt-2 text-lg font-bold leading-snug">{item.gloveClasses}</p>
              </div>

              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-widest text-neutral-400">{item.name}</p>
                <h3 className="mb-3 text-2xl font-extrabold tracking-tight text-ink">{item.pain}</h3>
                <p className="mb-5 text-[15px] leading-relaxed text-text-muted-light">{item.education}</p>
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-2 text-sm font-bold text-[var(--color-accent-orange)] hover:gap-3"
                >
                  Explore program
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </ProcurementSectionShell>
  );
}
