import type { ReactNode } from "react";
import { adminCardSurface, adminMutedPanel } from "@/components/admin/admin-theme-utils";
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
        disabled ? adminMutedPanel : adminCardSurface,
        disabled && "text-admin-secondary",
        className,
      )}
    >
      <div className={cn("border-b border-admin-border-subtle px-4 py-3", disabled && "border-dashed")}>
        <h2 className="text-sm font-semibold tracking-tight text-admin-primary">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-relaxed text-admin-muted">{description}</p> : null}
      </div>
      {children ? <div className="px-4 py-4">{children}</div> : null}
    </div>
  );
}
