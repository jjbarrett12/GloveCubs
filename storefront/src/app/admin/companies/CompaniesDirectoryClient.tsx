"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CustomerAccountCard, EmptyState } from "@/components/admin";
import {
  adminCardSurface,
  adminFormInput,
  adminMutedPanel,
  adminPrimaryButton,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import type { AdminCompanyDirectoryRow } from "@/lib/admin/admin-companies-read-model";

type Props = {
  rows: AdminCompanyDirectoryRow[];
};

export function CompaniesDirectoryClient({ rows }: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const email = r.derived_contact_email?.toLowerCase() ?? "";
      return (
        r.trade_name.toLowerCase().includes(needle) ||
        r.slug.toLowerCase().includes(needle) ||
        email.includes(needle)
      );
    });
  }, [rows, q]);

  return (
    <div>
      <div
        className={cn(
          adminCardSurface,
          "sticky top-0 z-10 -mx-1 mb-5 bg-admin-surface/95 px-3 py-3 backdrop-blur sm:-mx-0 sm:px-4",
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="block min-w-0 flex-1">
            <span className="sr-only">Search customer accounts</span>
            <input
              type="search"
              placeholder="Search by account name, slug, or quote contact email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={cn(adminFormInput, "w-full")}
            />
          </label>
          <Link href="/admin/companies/new" className={cn(adminPrimaryButton, "inline-flex shrink-0 items-center justify-center px-5 py-2.5")}>
            + Add Customer
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={cn(adminMutedPanel, "px-6 py-14 text-center shadow-inner")}>
          <EmptyState
            title="No customer accounts yet"
            description="Create your first customer account to set pricing, delivery locations, and preferred products."
            action={
              <Link href="/admin/companies/new" className={adminPrimaryButton}>
                + Add Customer
              </Link>
            }
            className="py-0"
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className={cn(adminCardSurface, "px-6 py-12 text-center")}>
          <EmptyState
            title="No customers match your search"
            description="Try a different name, slug, or email."
            className="py-0"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <CustomerAccountCard key={c.id} row={c} />
          ))}
        </div>
      )}

      {rows.length > 0 ? (
        <p className="mt-4 text-xs leading-relaxed text-admin-muted">
          Quote contact shows the email from the most recent linked quote request when available. Pricing tier changes
          are made on the customer account page.
        </p>
      ) : null}
    </div>
  );
}
