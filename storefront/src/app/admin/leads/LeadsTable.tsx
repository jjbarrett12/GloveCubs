"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { DataTable, StatusBadge, TableCard } from "@/components/admin";
import { adminFormInput } from "@/components/admin/admin-theme-utils";
import { formatShipToLabel } from "@/lib/commerce/ship-to-address-format";
import { describeQuoteStatusForOperator } from "@/lib/procurement/operator-lifecycle-copy";
import { cn } from "@/lib/utils";

export type LeadQuoteRow = {
  id: string;
  status: string;
  contact_name: string;
  email: string;
  company_name: string;
  phone: string | null;
  created_at: string;
  gc_company_id: string | null;
  ship_to_address_id: string | null;
  ship_to_label: string | null;
  ship_to_snapshot: unknown | null;
};

type LinkFilter = "all" | "linked" | "unlinked";

export function LeadsTable({ rows }: { rows: LeadQuoteRow[] }) {
  const [emailSearch, setEmailSearch] = useState("");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");

  const filteredRows = useMemo(() => {
    let result = rows;
    if (emailSearch.trim()) {
      const term = emailSearch.trim().toLowerCase();
      result = result.filter((r) => r.email?.toLowerCase().includes(term));
    }
    if (linkFilter === "linked") {
      result = result.filter((r) => r.gc_company_id != null);
    } else if (linkFilter === "unlinked") {
      result = result.filter((r) => r.gc_company_id == null);
    }
    return result;
  }, [rows, emailSearch, linkFilter]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[200px] flex-1 sm:max-w-xs">
          <label htmlFor="lead-email-search" className="block text-xs font-medium text-admin-muted">
            Filter by email
          </label>
          <input
            id="lead-email-search"
            type="text"
            value={emailSearch}
            onChange={(e) => setEmailSearch(e.target.value)}
            placeholder="buyer@example.com"
            className={cn(adminFormInput, "mt-1 w-full")}
          />
        </div>
        <div>
          <label htmlFor="lead-link-filter" className="block text-xs font-medium text-admin-muted">
            Company link
          </label>
          <select
            id="lead-link-filter"
            value={linkFilter}
            onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}
            className={cn(adminFormInput, "mt-1")}
          >
            <option value="all">All</option>
            <option value="linked">Linked to company</option>
            <option value="unlinked">Unlinked (anonymous)</option>
          </select>
        </div>
        <p className="text-xs text-admin-muted">
          Showing {filteredRows.length} of {rows.length} quote requests
        </p>
      </div>

      <TableCard>
        <DataTable<LeadQuoteRow & Record<string, unknown>>
          columns={[
            {
              key: "created_at",
              header: "Created",
              width: "140px",
              mono: true,
              render: (row) => new Date(row.created_at).toLocaleString(),
            },
            {
              key: "status",
              header: "Operator review",
              render: (row) => {
                const copy = describeQuoteStatusForOperator(row.status);
                return (
                  <div>
                    <StatusBadge status={row.status} />
                    <p className="mt-0.5 max-w-[160px] text-[10px] text-admin-muted">{copy.actionHint}</p>
                  </div>
                );
              },
            },
            {
              key: "buyer_status",
              header: "Buyer sees",
              render: (row) => describeQuoteStatusForOperator(row.status).buyerSees,
            },
            { key: "contact_name", header: "Name" },
            { key: "email", header: "Email" },
            { key: "company_name", header: "Company" },
            {
              key: "gc_company_id",
              header: "Linked",
              render: (row) =>
                row.gc_company_id ? (
                  <Link
                    href={`/admin/companies/${row.gc_company_id}`}
                    className="inline-flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200 hover:border-emerald-400/50"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Linked
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded border border-admin-border bg-admin-surface px-2 py-0.5 text-[10px] font-medium text-admin-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-admin-muted" />
                    Unlinked
                  </span>
                ),
            },
            {
              key: "delivery",
              header: "Delivery context",
              render: (row) => {
                const hasSnap = row.ship_to_snapshot != null;
                const warnIdNoSnap = Boolean(row.ship_to_address_id) && !hasSnap;
                const deliveryText = hasSnap
                  ? formatShipToLabel(row.ship_to_label, row.ship_to_snapshot)
                  : "—";
                return (
                  <div className="max-w-[240px] align-top">
                    <p className="font-mono text-[10px] text-admin-muted">{row.id.slice(0, 8)}…</p>
                    <p className="text-sm">{deliveryText}</p>
                    {warnIdNoSnap ? (
                      <p className="mt-1 text-xs font-medium text-admin-warning">
                        ship_to_address_id without quote-time snapshot
                      </p>
                    ) : null}
                  </div>
                );
              },
            },
          ]}
          data={filteredRows}
          keyField="id"
          emptyMessage="No quote requests match the current filter."
          stickyHeader
        />
      </TableCard>
    </div>
  );
}
