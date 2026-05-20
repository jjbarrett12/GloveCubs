import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionEyebrow } from "@/components/procurement";
import type { SectionEyebrowTone } from "@/components/procurement/SectionEyebrow";

export function HomeBridge({ variant }: { variant: "to-light" | "to-dark" | "to-gray" | "gray-to-dark" }) {
  const gradient =
    variant === "to-light"
      ? "from-[#0a0a0a] to-white"
      : variant === "to-gray"
        ? "from-white to-[#f4f4f2]"
        : variant === "gray-to-dark"
          ? "from-[#f4f4f2] to-[#0a0a0a]"
          : "from-[#121212] to-[#0a0a0a]";
  return <div className={cn("pointer-events-none h-12 w-full bg-gradient-to-b sm:h-16", gradient)} aria-hidden />;
}

type HomeSectionIntroProps = {
  eyebrow: ReactNode;
  title: string;
  description?: string;
  headingId: string;
  tone?: SectionEyebrowTone;
  eyebrowIcon?: LucideIcon;
  badge?: ReactNode;
  className?: string;
};

export function HomeSectionIntro({
  eyebrow,
  title,
  description,
  headingId,
  tone = "light",
  eyebrowIcon,
  badge,
  className,
}: HomeSectionIntroProps) {
  const isDark = tone === "dark";

  return (
    <header className={cn("home-intro mb-12 sm:mb-14 lg:mb-16", className)}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SectionEyebrow tone={tone} icon={eyebrowIcon} className="mb-0">
          {eyebrow}
        </SectionEyebrow>
        {badge}
      </div>
      <h2
        id={headingId}
        className={cn(isDark ? "proc-display-xl max-w-4xl" : "proc-display-light max-w-4xl", "mb-4")}
      >
        {title}
      </h2>
      {description ? (
        <p className={cn(isDark ? "proc-body max-w-2xl text-lg" : "proc-body-light max-w-2xl text-[17px]")}>
          {description}
        </p>
      ) : null}
    </header>
  );
}

export function HomeEducationalBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45">
      {children}
    </span>
  );
}

type HomeCtaLinkProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  icon?: LucideIcon;
};

export function HomeCtaLink({ href, children, variant = "primary", className, icon: Icon }: HomeCtaLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold transition",
        variant === "primary" && "home-cta-primary",
        variant === "secondary" && "home-cta-secondary",
        variant === "ghost" &&
          "border border-white/15 text-white/90 hover:border-[var(--color-accent-orange)]/40 hover:text-white",
        className
      )}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
      {children}
    </Link>
  );
}

export function HomePanelDark({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("home-panel-dark", className)}>{children}</div>;
}

export function HomePanelLight({
  children,
  className,
  id,
  role,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  role?: string;
  "aria-label"?: string;
}) {
  return (
    <div id={id} role={role} aria-label={ariaLabel} className={cn("home-panel-light", className)}>
      {children}
    </div>
  );
}
