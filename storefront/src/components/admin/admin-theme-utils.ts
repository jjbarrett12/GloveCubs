import { cn } from "@/lib/utils";

/** Common admin surface — card/panel on canvas */
export const adminCardSurface = "rounded-lg border border-admin-border bg-admin-surface shadow-sm";

/** Muted inset panel (unavailable states, toolbars) */
export const adminMutedPanel =
  "rounded-xl border border-dashed border-admin-border bg-admin-surface-muted";

/** Primary text block */
export const adminBodyText = "text-sm text-admin-secondary";

/** Section eyebrow */
export const adminEyebrow = "text-[10px] font-bold uppercase tracking-[0.14em] text-admin-accent";

/** Table wrapper inside TableCard */
export const adminTableShell = "min-w-full divide-y divide-admin-border-subtle";

/** Table header row */
export const adminTableHead = "bg-admin-surface-muted";

/** Table header cell */
export const adminTableHeadCell =
  "text-left text-xs font-medium uppercase tracking-wider text-admin-muted";

/** Table body */
export const adminTableBody = "divide-y divide-admin-border-subtle bg-admin-surface";

/** Table data cell */
export const adminTableCell = "text-sm text-admin-primary";

/** Interactive row hover/selected */
export const adminTableRowHover = "hover:bg-admin-surface-muted";
export const adminTableRowSelected = "bg-admin-accent-soft ring-1 ring-inset ring-admin-accent/25";

export type AdminStatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";

const STATUS_TONE_MAP: Record<string, AdminStatusTone> = {
  pending: "warning",
  running: "info",
  completed: "success",
  failed: "danger",
  blocked: "info",
  cancelled: "neutral",
  open: "warning",
  in_review: "info",
  approved: "success",
  rejected: "danger",
  resolved: "neutral",
  critical: "danger",
  high: "warning",
  medium: "warning",
  low: "success",
  enabled: "success",
  disabled: "neutral",
  success: "success",
  warning: "warning",
  error: "danger",
  info: "info",
  neutral: "neutral",
  draft: "warning",
  processing: "info",
  paid: "success",
  active: "success",
  fulfilled: "success",
};

export function adminStatusTone(status: string): AdminStatusTone {
  return STATUS_TONE_MAP[status] ?? "neutral";
}

export function adminStatusBadgeClasses(tone: AdminStatusTone): string {
  const map: Record<AdminStatusTone, string> = {
    success: "bg-admin-success/15 text-admin-success ring-admin-success/30",
    warning: "bg-admin-warning/15 text-admin-warning ring-admin-warning/30",
    danger: "bg-admin-danger/15 text-admin-danger ring-admin-danger/30",
    info: "bg-admin-info/15 text-admin-info ring-admin-info/30",
    neutral: "bg-admin-surface-muted text-admin-secondary ring-admin-border",
    accent: "bg-admin-accent-soft text-admin-accent ring-admin-accent/30",
  };
  return cn("ring-1 ring-inset", map[tone]);
}

export function adminTypeBadgeClasses(type: string): string {
  const map: Record<string, AdminStatusTone> = {
    supplier: "accent",
    catalog: "info",
    product_match: "info",
    pricing: "success",
    audit: "warning",
    system: "neutral",
  };
  return adminStatusBadgeClasses(map[type] ?? "neutral");
}

export function adminAlertSurface(
  severity: "critical" | "warning" | "info" | "success",
  className?: string,
): string {
  const map = {
    critical: "border-admin-danger/30 bg-[var(--admin-danger-surface)] text-admin-danger",
    warning: "border-admin-warning/30 bg-[var(--admin-warning-surface)] text-admin-warning",
    info: "border-admin-info/30 bg-[var(--admin-info-surface)] text-admin-info",
    success: "border-admin-success/30 bg-[var(--admin-success-surface)] text-admin-success",
  };
  return cn("rounded-lg border px-4 py-3 text-sm", map[severity], className);
}

export function adminFocusRing(className?: string): string {
  return cn(
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-admin-canvas",
    className,
  );
}

/** Compact admin form controls */
export const adminFormLabel = "block text-xs font-semibold text-admin-muted";

export const adminFormInput =
  "mt-1 rounded border border-admin-border bg-admin-surface px-2 py-1.5 text-sm text-admin-primary placeholder:text-admin-muted";

export const adminPrimaryButton =
  "rounded-md bg-admin-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50";

export const adminSecondaryButton =
  "rounded-md border border-admin-border bg-admin-surface px-3 py-2 text-sm font-medium text-admin-secondary transition-colors hover:bg-admin-surface-muted disabled:opacity-50";

export const adminLink = "font-medium text-admin-accent hover:underline";
