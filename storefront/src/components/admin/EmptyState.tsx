/**
 * Admin Empty State Component
 * 
 * Consistent empty state display for admin tables and lists
 */

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  variant?: "default" | "dark";
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  variant = "default",
}: EmptyStateProps) {
  const dark = variant === "dark";
  return (
    <div className={cn("flex flex-col items-center justify-center px-4 py-12", className)}>
      {icon && <div className={cn("mb-4", dark ? "text-neutral-600" : "text-gray-300")}>{icon}</div>}
      <h3 className={cn("text-sm font-medium", dark ? "text-white" : "text-gray-900")}>{title}</h3>
      {description && (
        <p className={cn("mt-1 max-w-sm text-center text-sm", dark ? "text-neutral-500" : "text-gray-500")}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
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
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
      <p className="mt-3 text-sm text-gray-500">{message}</p>
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
    <div className={cn("flex flex-col items-center justify-center py-12 px-4", className)}>
      <div className="rounded-full bg-red-50 p-3 mb-4">
        <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      {message && (
        <p className="mt-1 text-sm text-red-600 text-center max-w-sm">{message}</p>
      )}
      {retry && (
        <button
          onClick={retry}
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Try again
        </button>
      )}
    </div>
  );
}
