"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CustomerAccountCard } from "@/components/admin";
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
      <div className="sticky top-0 z-10 -mx-1 mb-5 rounded-xl border border-slate-200/90 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:-mx-0 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="block min-w-0 flex-1">
            <span className="sr-only">Search customer accounts</span>
            <input
              type="search"
              placeholder="Search by account name, slug, or quote contact email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-[#f06232] focus:outline-none focus:ring-1 focus:ring-[#f06232]/40"
            />
          </label>
          <Link
            href="/admin/companies/new"
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#f06232] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#d8552a]"
          >
            + Add Customer
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center shadow-inner">
          <p className="text-base font-semibold text-slate-900">No customer accounts yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
            Create your first customer account to set pricing, delivery locations, and preferred products.
          </p>
          <Link
            href="/admin/companies/new"
            className="mt-6 inline-flex rounded-lg bg-[#f06232] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#d8552a]"
          >
            + Add Customer
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white px-6 py-12 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-900">No customers match your search</p>
          <p className="mt-1 text-xs text-slate-500">Try a different name, slug, or email.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <CustomerAccountCard key={c.id} row={c} />
          ))}
        </div>
      )}

      {rows.length > 0 ? (
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Quote contact shows the email from the most recent linked quote request when available. Pricing tier changes
          are made on the customer account page.
        </p>
      ) : null}
    </div>
  );
}
