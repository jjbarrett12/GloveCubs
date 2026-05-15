import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  variant?: "default" | "disabled";
  children?: ReactNode;
  className?: string;
};

export function OnboardingCard({ title, description, variant = "default", children, className }: Props) {
  const disabled = variant === "disabled";
  return (
    <div
      className={cn(
        "rounded-xl border bg-white shadow-sm",
        disabled
          ? "border-dashed border-slate-200/90 bg-slate-50/60 text-slate-600"
          : "border-slate-200/90",
        className,
      )}
    >
      <div className={cn("border-b border-slate-100 px-4 py-3", disabled && "border-slate-200/80")}>
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p> : null}
      </div>
      {children ? <div className="px-4 py-4">{children}</div> : null}
    </div>
  );
}
