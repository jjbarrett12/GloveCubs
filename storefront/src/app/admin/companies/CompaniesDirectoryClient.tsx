"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TableCard } from "@/components/admin";
import { b2bTierLabel } from "@/lib/pricing/b2b-tier-meta";
import type { AdminCompanyDirectoryRow } from "@/lib/admin/admin-companies-read-model";
import { CompanyRowActions } from "./CompanyRowActions";

function tierBadgeClass(code: string): string {
  switch (code) {
    case "kodiak":
      return "bg-amber-100 text-amber-900";
    case "grizzly":
      return "bg-slate-200 text-slate-800";
    default:
      return "bg-sky-100 text-sky-900";
  }
}

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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="block flex-1">
          <span className="sr-only">Search customers</span>
          <input
            type="search"
            placeholder="Search by company name, slug, or contact email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>
        <Link
          href="/admin/companies/new"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#f06232] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#d8552a]"
        >
          + Add Customer
        </Link>
      </div>

      <TableCard>
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3 text-right">Members</th>
                <th className="px-4 py-3 text-right">Quotes</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">Quicklist</th>
                <th className="px-4 py-3">Last activity</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                    No customers yet.{" "}
                    <Link href="/admin/companies/new" className="font-medium text-[#f06232] underline">
                      Add your first customer
                    </Link>
                    .
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                    No customers match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <Link href={`/admin/companies/${c.id}`} className="group block">
                        <span className="font-medium text-slate-900 group-hover:text-[#f06232]">{c.trade_name}</span>
                        <span className="mt-0.5 block font-mono text-[11px] text-slate-500">{c.slug}</span>
                      </Link>
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-slate-700">
                      {c.derived_contact_email ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tierBadgeClass(c.b2b_pricing_tier_code)}`}
                      >
                        {b2bTierLabel(c.b2b_pricing_tier_code)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-800">{c.member_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-800">{c.quote_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-800">{c.order_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-800">{c.quicklist_count}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                      {c.last_activity_at ? new Date(c.last_activity_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <CompanyRowActions companyId={c.id} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </TableCard>

      <p className="mt-3 text-xs text-slate-500">
        Contact column uses the email from the most recent linked quote request when available. Tier changes are made on
        the customer detail page.
      </p>
    </div>
  );
}
