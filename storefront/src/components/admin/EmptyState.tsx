/**
 * Admin Empty State Component
 *
 * Consistent empty state display for admin tables and lists.
 */

import { cn } from "@/lib/utils";
import { adminFocusRing } from "@/components/admin/admin-theme-utils";
import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** @deprecated Theme follows data-admin-theme */
  variant?: "default" | "dark";
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-4 py-12", className)}>
      {icon ? <div className="mb-4 text-admin-muted">{icon}</div> : null}
      <h3 className="text-sm font-medium text-admin-primary">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-center text-sm text-admin-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingState({
  message = "Loading...",
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12", className)}>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-admin-border-subtle border-t-admin-accent" />
      <p className="mt-3 text-sm text-admin-muted">{message}</p>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  retry,
  className,
}: {
  title?: string;
  message?: string;
  retry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-4 py-12", className)}>
      <div className="mb-4 rounded-full bg-[var(--admin-danger-surface)] p-3">
        <svg className="h-6 w-6 text-admin-danger" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-admin-primary">{title}</h3>
      {message ? <p className="mt-1 max-w-sm text-center text-sm text-admin-danger">{message}</p> : null}
      {retry ? (
        <button
          type="button"
          onClick={retry}
          className={cn(
            "mt-4 rounded-md bg-admin-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90",
            adminFocusRing(),
          )}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
