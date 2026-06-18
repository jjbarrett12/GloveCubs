import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AdminModuleId } from "@/lib/admin/admin-health";
import { MODULE_UNAVAILABLE_COPY } from "@/lib/admin/admin-health";
import { adminFocusRing, adminMutedPanel } from "@/components/admin/admin-theme-utils";

type Reason = "setup_required" | "unavailable" | "production_blocking" | "degraded";

type Props = {
  moduleName?: string;
  moduleId?: AdminModuleId;
  title?: string;
  description?: string;
  reason?: Reason;
  detailsHref?: string;
  className?: string;
};

function reasonLabel(reason: Reason | undefined, isProductionBlocking: boolean): string | null {
  if (isProductionBlocking) return "Production configuration required";
  if (reason === "setup_required") return "Setup required for this environment";
  if (reason === "degraded") return "Partially available";
  if (reason === "unavailable") return "Unavailable";
  return null;
}

export function ModuleUnavailableState({
  moduleName,
  moduleId,
  title,
  description,
  reason = "unavailable",
  detailsHref = "/admin/settings#health",
  className,
}: Props) {
  const copy = moduleId ? MODULE_UNAVAILABLE_COPY[moduleId] : null;
  const resolvedTitle = title ?? copy?.title ?? `${moduleName ?? "This module"} is unavailable`;
  const resolvedDescription =
    description ??
    copy?.description ??
    "Required system configuration is incomplete for this module in the current environment.";
  const eyebrow = reasonLabel(reason, reason === "production_blocking");

  return (
    <div className={cn(adminMutedPanel, "px-6 py-10 text-center shadow-inner", className)} role="status">
      {eyebrow ? (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-admin-warning">{eyebrow}</p>
      ) : null}
      <h2 className="mt-2 text-base font-semibold text-admin-primary">{resolvedTitle}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-admin-secondary">{resolvedDescription}</p>
      <div className="mt-5">
        <Link
          href={detailsHref}
          className={cn(
            "inline-flex items-center justify-center rounded-lg border border-admin-border bg-admin-surface px-4 py-2 text-sm font-medium text-admin-primary shadow-sm transition hover:bg-admin-surface-muted",
            adminFocusRing(),
          )}
        >
          View Admin Health
        </Link>
      </div>
    </div>
  );
}
