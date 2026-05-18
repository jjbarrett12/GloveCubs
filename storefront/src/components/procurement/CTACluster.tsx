import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CTAClusterLink = {
  href: string;
  label: string;
  icon?: LucideIcon;
};

export type CTAClusterProps = {
  primary: CTAClusterLink;
  secondary?: CTAClusterLink;
  tertiary?: ReactNode;
  className?: string;
  align?: "start" | "center";
};

function CtaLink({
  href,
  label,
  icon: Icon,
  variant,
}: CTAClusterLink & { variant: "primary" | "secondary" }) {
  const base = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition";
  const styles =
    variant === "primary"
      ? cn(base, "bg-brand px-7 py-3.5 font-bold text-white shadow-proc-brand hover:-translate-y-0.5 hover:bg-brand-hover")
      : cn(
          base,
          "border border-brand/55 bg-white/[0.04] px-5 py-3 text-brand backdrop-blur-[2px] hover:-translate-y-0.5 hover:border-brand hover:bg-white/[0.07]"
        );

  return (
    <Link href={href} className={styles}>
      {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
      {label}
    </Link>
  );
}

export function CTACluster({ primary, secondary, tertiary, className, align = "start" }: CTAClusterProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div
        className={cn(
          "flex flex-wrap gap-3",
          align === "center" ? "justify-center" : "justify-start"
        )}
      >
        <CtaLink {...primary} variant="primary" />
        {secondary ? <CtaLink {...secondary} variant="secondary" /> : null}
      </div>
      {tertiary ? (
        <div
          className={cn(
            "flex flex-wrap gap-x-6 gap-y-2 text-sm",
            align === "center" ? "justify-center" : "justify-start"
          )}
        >
          {tertiary}
        </div>
      ) : null}
    </div>
  );
}

export function CTAClusterTertiaryLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 font-medium text-white/60 transition hover:text-brand-soft",
        className
      )}
    >
      {children}
    </Link>
  );
}
