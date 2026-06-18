import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AdminHealthIssue } from "@/lib/admin/admin-health";
import { adminAlertSurface } from "@/components/admin/admin-theme-utils";

type Props = {
  issues: AdminHealthIssue[];
  scope?: "shell" | "module" | "settings";
  moduleId?: string;
  className?: string;
};

function severityToAlert(severity: AdminHealthIssue["severity"]): "critical" | "warning" | "info" {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  return "info";
}

function filterIssues(issues: AdminHealthIssue[], moduleId?: string): AdminHealthIssue[] {
  if (!moduleId) return issues;
  return issues.filter((issue) => issue.moduleIds.includes(moduleId as AdminHealthIssue["moduleIds"][number]));
}

export function AdminHealthBanner({ issues, scope = "module", moduleId, className }: Props) {
  const visible = filterIssues(issues, scope === "module" ? moduleId : undefined);
  if (visible.length === 0) return null;

  if (scope === "module") {
    const top = visible[0]!;
    return (
      <div className={cn(adminAlertSurface(severityToAlert(top.severity)), "mb-4", className)} role="status">
        <p className="font-medium text-admin-primary">{top.title}</p>
        <p className="mt-1 text-sm text-admin-secondary">
          {top.message}{" "}
          <Link href="/admin/settings#health" className="font-medium text-admin-accent underline underline-offset-2">
            View Admin Health
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {visible.map((issue) => (
        <div key={issue.id} className={adminAlertSurface(severityToAlert(issue.severity))} role="status">
          <p className="font-medium text-admin-primary">{issue.title}</p>
          <p className="mt-1 text-admin-secondary">{issue.message}</p>
          {scope === "settings" && issue.settingsOnlyDetails ? (
            <p className="mt-2 text-xs text-admin-muted">{issue.settingsOnlyDetails}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
