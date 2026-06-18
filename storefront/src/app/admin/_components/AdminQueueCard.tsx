import Link from "next/link";
import { StatusBadge } from "@/components/admin";
import { adminFocusRing } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description: string;
  value: string | number;
  href: string;
  badgeStatus?: string;
  needsAttention?: boolean;
};

export function AdminQueueCard({
  title,
  description,
  value,
  href,
  badgeStatus,
  needsAttention,
}: Props) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col rounded-xl border border-admin-border bg-admin-surface p-4 ring-1 ring-admin-border-subtle transition-colors",
        adminFocusRing(),
        "hover:border-admin-border hover:bg-admin-surface-muted",
        needsAttention && "border-admin-warning/35 ring-admin-warning/15",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">{title}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums leading-none text-admin-primary">{value}</p>
        </div>
        {badgeStatus ? <StatusBadge status={badgeStatus} dot className="shrink-0" /> : null}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-admin-secondary">{description}</p>
      <span className="mt-3 text-xs font-medium text-admin-accent">Open queue →</span>
    </Link>
  );
}
