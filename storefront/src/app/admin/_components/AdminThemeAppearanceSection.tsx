"use client";

import { AdminThemeToggle } from "@/app/admin/_components/AdminThemeToggle";

export function AdminThemeAppearanceSection() {
  return (
    <section
      id="appearance"
      className="mb-6 scroll-mt-6 overflow-hidden rounded-lg border border-admin-border bg-admin-surface shadow-sm"
    >
      <header className="border-b border-admin-border bg-admin-surface-muted px-4 py-3">
        <h2 className="text-sm font-semibold text-admin-primary">Appearance</h2>
        <p className="mt-1 text-xs text-admin-secondary">
          Admin theme applies only to the operator portal — storefront buyer pages are unchanged.
        </p>
      </header>
      <div className="px-4 py-4">
        <AdminThemeToggle />
      </div>
    </section>
  );
}
