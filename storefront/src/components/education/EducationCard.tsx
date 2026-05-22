import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type EducationCardProps = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  className?: string;
};

export function EducationCard({ title, description, href, icon: Icon, className }: EducationCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex h-full flex-col rounded-2xl border border-[#ebebea] bg-white p-6 shadow-[0_8px_30px_rgb(0_0_0/0.04)] transition duration-200",
        "hover:-translate-y-0.5 hover:border-[var(--color-accent-orange)]/30 hover:shadow-[0_14px_40px_rgb(0_0_0/0.08)]",
        className
      )}
    >
      <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#ebebea] bg-[#fafaf8] text-[var(--color-accent-orange)]">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="text-lg font-bold tracking-tight text-[#0a0a0a]">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-600">{description}</p>
      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-accent-orange)]">
        Explore
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}
