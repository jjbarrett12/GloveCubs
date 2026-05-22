import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SectionEyebrow } from "@/components/procurement";
import { cn } from "@/lib/utils";

type EducationSectionIntroProps = {
  eyebrow: ReactNode;
  title: string;
  description?: string;
  headingId: string;
  eyebrowIcon?: LucideIcon;
  className?: string;
  titleClassName?: string;
};

export function EducationSectionIntro({
  eyebrow,
  title,
  description,
  headingId,
  eyebrowIcon,
  className,
  titleClassName,
}: EducationSectionIntroProps) {
  return (
    <header className={cn("mb-10 sm:mb-12 lg:mb-14", className)}>
      <div className="mb-4 flex items-center gap-3">
        <span className="h-px w-8 shrink-0 bg-[var(--color-accent-orange)]" aria-hidden />
        <SectionEyebrow tone="light" icon={eyebrowIcon} className="mb-0 justify-start text-[11px] tracking-[0.2em]">
          {eyebrow}
        </SectionEyebrow>
      </div>
      <h2 id={headingId} className={cn("proc-display-light max-w-3xl", titleClassName)}>
        {title}
      </h2>
      {description ? (
        <p className="proc-body-light mt-4 max-w-2xl text-[17px] text-neutral-600">{description}</p>
      ) : null}
    </header>
  );
}
