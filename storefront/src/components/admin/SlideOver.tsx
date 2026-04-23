"use client";

/**
 * Admin Slide-Over Panel Component
 * 
 * Right-side slide-over for viewing record details without leaving the list view.
 * Used for job details, review items, audit reports, etc.
 */

import { cn } from "@/lib/utils";
import { ReactNode, useEffect, useCallback } from "react";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
  footer?: ReactNode;
}

const WIDTHS = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-xl",
  xl: "max-w-2xl",
};

export function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = "md",
  footer,
}: SlideOverProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-500/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
        <div
          className={cn(
            "w-screen transform transition-transform duration-300 ease-out",
            WIDTHS[width],
            open ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex h-full flex-col bg-white shadow-xl">
            {/* Header */}
            <div className="px-4 py-4 sm:px-6 border-b border-gray-200 bg-gray-50">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {title && (
                    <h2 className="text-lg font-semibold text-gray-900 truncate">
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p className="mt-0.5 text-sm text-gray-500 truncate">
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <span className="sr-only">Close panel</span>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="border-t border-gray-200 px-4 py-4 sm:px-6 bg-gray-50">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SlideOverSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6", className)}>
      {title && (
        <h3 className="text-sm font-medium text-gray-500 mb-2 uppercase tracking-wide">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

export function SlideOverField({
  label,
  value,
  mono,
  truncate,
  className,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  truncate?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("py-2 grid grid-cols-3 gap-4", className)}>
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd
        className={cn(
          "text-sm text-gray-900 col-span-2",
          mono && "font-mono text-xs",
          truncate && "truncate"
        )}
        title={truncate && typeof value === "string" ? value : undefined}
      >
        {value ?? <span className="text-gray-400">—</span>}
      </dd>
    </div>
  );
}
