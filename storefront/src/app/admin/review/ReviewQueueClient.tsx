"use client";

/**
 * Review Queue Client Component
 * 
 * Production-ready review interface with:
 * - Table view for fast scanning
 * - Bulk selection and actions
 * - Advanced filtering
 * - Detail panel with machine reasoning
 */

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  StatusBadge,
  TypeBadge,
  SlideOver,
  SlideOverSection,
  TableToolbar,
  EmptyState,
} from "@/components/admin";

interface ReviewRow {
  id: string;
  review_type: string;
  status: string;
  priority: string;
  title: string;
  issue_category: string;
  issue_summary: string;
  recommended_action: string | null;
  agent_name: string | null;
  confidence: number | null;
  details: Record<string, unknown>;
  source_table: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_notes: string | null;
}

interface Props {
  items: ReviewRow[];
  categories: string[];
  currentFilters: {
    status?: string;
    type?: string;
    priority?: string;
    confidence?: string;
    category?: string;
    days?: string;
  };
  stats: {
    open: number;
    byType: Record<string, number>;
  };
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_COLORS: Record<string, string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-amber-500",
  low: "border-l-green-500",
};

export function ReviewQueueClient({ items, categories, currentFilters, stats }: Props) {
  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<ReviewRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState("");

  // Filter items locally for instant search
  const filteredItems = useMemo(() => {
    if (!localSearch.trim()) return items;
    const search = localSearch.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(search) ||
        item.issue_summary.toLowerCase().includes(search) ||
        item.issue_category.toLowerCase().includes(search) ||
        item.source_id?.toLowerCase().includes(search)
    );
  }, [items, localSearch]);

  const buildFilterUrl = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams();
      const filters = { ...currentFilters, [key]: value };
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== "all") params.set(k, v);
      });
      const query = params.toString();
      return query ? `/admin/review?${query}` : "/admin/review";
    },
    [currentFilters]
  );

  const handleAction = async (action: "approve" | "reject", ids?: string[]) => {
    const targetIds = ids || (selectedItem ? [selectedItem.id] : []);
    if (targetIds.length === 0) return;

    setActionLoading(action);
    try {
      await Promise.all(
        targetIds.map((id) =>
          fetch(`/api/admin/review/${id}/${action}`, { method: "POST" })
        )
      );
      router.refresh();
      setSelectedIds(new Set());
      setSelectedItem(null);
    } catch (error) {
      console.error("Action failed:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatConfidence = (conf: number | null) => {
    if (conf == null) return "—";
    const pct = Math.round(conf * 100);
    return `${pct}%`;
  };

  const getConfidenceColor = (conf: number | null) => {
    if (conf == null) return "text-gray-400";
    if (conf >= 0.8) return "text-green-600";
    if (conf >= 0.5) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <>
      {/* Toolbar with filters */}
      <TableToolbar className="flex-wrap gap-2">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-48 pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <svg
            className="absolute left-2.5 top-2 w-4 h-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Status filter */}
        <FilterSelect
          label="Status"
          value={currentFilters.status || "all"}
          options={[
            { value: "all", label: "Active" },
            { value: "open", label: "Open" },
            { value: "in_review", label: "In Review" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
          ]}
          onChange={(v) => router.push(buildFilterUrl("status", v))}
        />

        {/* Type filter */}
        <FilterSelect
          label="Type"
          value={currentFilters.type || "all"}
          options={[
            { value: "all", label: "All Types" },
            { value: "catalog", label: `Catalog (${stats.byType.catalog || 0})` },
            { value: "product_match", label: `Match (${stats.byType.product_match || 0})` },
            { value: "pricing", label: `Pricing (${stats.byType.pricing || 0})` },
            { value: "supplier", label: `Supplier (${stats.byType.supplier || 0})` },
            { value: "audit", label: `Audit (${stats.byType.audit || 0})` },
          ]}
          onChange={(v) => router.push(buildFilterUrl("type", v))}
        />

        {/* Priority filter */}
        <FilterSelect
          label="Priority"
          value={currentFilters.priority || "all"}
          options={[
            { value: "all", label: "All" },
            { value: "critical", label: "Critical" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
          onChange={(v) => router.push(buildFilterUrl("priority", v))}
        />

        {/* Confidence filter */}
        <FilterSelect
          label="Confidence"
          value={currentFilters.confidence || "all"}
          options={[
            { value: "all", label: "All" },
            { value: "low", label: "<50%" },
            { value: "medium", label: "50-80%" },
            { value: "high", label: ">80%" },
          ]}
          onChange={(v) => router.push(buildFilterUrl("confidence", v))}
        />

        {/* Date filter */}
        <FilterSelect
          label="Date"
          value={currentFilters.days || "all"}
          options={[
            { value: "all", label: "All Time" },
            { value: "1", label: "Today" },
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
          ]}
          onChange={(v) => router.push(buildFilterUrl("days", v))}
        />

        {/* Category filter */}
        {categories.length > 0 && (
          <FilterSelect
            label="Category"
            value={currentFilters.category || "all"}
            options={[
              { value: "all", label: "All Categories" },
              ...categories.map((c) => ({ value: c, label: c })),
            ]}
            onChange={(v) => router.push(buildFilterUrl("category", v))}
          />
        )}

        <div className="flex-1" />

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">{selectedIds.size} selected</span>
            <button
              onClick={() => handleAction("approve", Array.from(selectedIds))}
              disabled={!!actionLoading}
              className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading === "approve" ? "..." : "Approve All"}
            </button>
            <button
              onClick={() => handleAction("reject", Array.from(selectedIds))}
              disabled={!!actionLoading}
              className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {actionLoading === "reject" ? "..." : "Reject All"}
            </button>
          </div>
        )}

        <span className="text-xs text-gray-400">{filteredItems.length} items</span>
      </TableToolbar>

      {/* Table */}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          title="No items to review"
          description={localSearch ? "Try adjusting your search" : "All caught up!"}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                    onChange={selectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Priority
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase min-w-[200px]">
                  Issue
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Category
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Conf
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Source
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Created
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`cursor-pointer transition-colors hover:bg-blue-50 border-l-4 ${
                    PRIORITY_COLORS[item.priority] || "border-l-gray-200"
                  } ${selectedItem?.id === item.id ? "bg-blue-50" : ""}`}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={item.priority} />
                  </td>
                  <td className="px-3 py-2">
                    <TypeBadge type={item.review_type} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="max-w-xs">
                      <div className="text-sm font-medium text-gray-900 truncate" title={item.title}>
                        {item.title}
                      </div>
                      <div className="text-xs text-gray-500 truncate" title={item.issue_summary}>
                        {item.issue_summary}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{item.issue_category}</td>
                  <td className={`px-3 py-2 text-sm font-mono ${getConfidenceColor(item.confidence)}`}>
                    {formatConfidence(item.confidence)}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-gray-500 truncate max-w-[100px]" title={item.source_id || ""}>
                    {item.source_id?.slice(0, 8) || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {formatDate(item.created_at)}
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setSelectedItem(item);
                          handleAction("approve", [item.id]);
                        }}
                        className="p-1 rounded text-green-600 hover:bg-green-50"
                        title="Approve"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedItem(item);
                          handleAction("reject", [item.id]);
                        }}
                        className="p-1 rounded text-red-600 hover:bg-red-50"
                        title="Reject"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Panel */}
      <ReviewDetailPanel
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onAction={handleAction}
        actionLoading={actionLoading}
      />
    </>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-gray-300 rounded-md py-1.5 px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
      aria-label={label}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function ReviewDetailPanel({
  item,
  onClose,
  onAction,
  actionLoading,
}: {
  item: ReviewRow | null;
  onClose: () => void;
  onAction: (action: "approve" | "reject") => void;
  actionLoading: string | null;
}) {
  if (!item) return null;

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleString();
  };

  const details = item.details || {};
  const machineReasoning = details.reasoning || details.machine_reasoning || details.analysis;
  const parsedAttributes = details.parsed_attributes || details.attributes || details.normalized_data;
  const sourceRecord = details.source_record || details.raw_data || details.original;

  return (
    <SlideOver
      open={!!item}
      onClose={onClose}
      title={item.title}
      subtitle={`${item.review_type.replace(/_/g, " ")} • ${item.id.slice(0, 8)}`}
      width="xl"
      footer={
        <div className="flex gap-2">
          <button
            onClick={() => onAction("approve")}
            disabled={!!actionLoading}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {actionLoading === "approve" ? "Approving..." : "Approve"}
          </button>
          <button
            onClick={() => onAction("reject")}
            disabled={!!actionLoading}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {actionLoading === "reject" ? "Rejecting..." : "Reject"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      }
    >
      {/* Status Header */}
      <SlideOverSection>
        <div className="flex items-center gap-3 flex-wrap">
          <StatusBadge status={item.priority} size="md" />
          <TypeBadge type={item.review_type} />
          <StatusBadge status={item.status} size="md" />
          {item.confidence != null && (
            <span className={`text-sm font-medium ${
              item.confidence >= 0.8 ? "text-green-600" : item.confidence >= 0.5 ? "text-amber-600" : "text-red-600"
            }`}>
              {Math.round(item.confidence * 100)}% confidence
            </span>
          )}
        </div>
      </SlideOverSection>

      {/* Issue Summary */}
      <SlideOverSection title="Issue">
        <div className="space-y-3">
          <div className="flex gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase w-20 flex-shrink-0">Category</span>
            <span className="text-sm text-gray-900">{item.issue_category}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase w-20 flex-shrink-0">Summary</span>
            <span className="text-sm text-gray-900">{item.issue_summary}</span>
          </div>
        </div>
      </SlideOverSection>

      {/* Recommended Action */}
      {item.recommended_action && (
        <SlideOverSection title="Recommended Action">
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-blue-800">{item.recommended_action}</p>
          </div>
        </SlideOverSection>
      )}

      {/* Machine Reasoning — details values are unknown; avoid `unknown && JSX` (not a valid ReactNode). */}
      {!!machineReasoning && (
        <SlideOverSection title="Machine Reasoning">
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
            {typeof machineReasoning === "string" ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{machineReasoning}</p>
            ) : (
              <pre className="text-xs text-gray-700 font-mono overflow-x-auto">
                {JSON.stringify(machineReasoning, null, 2)}
              </pre>
            )}
          </div>
        </SlideOverSection>
      )}

      {/* Parsed Attributes */}
      {!!parsedAttributes &&
        typeof parsedAttributes === "object" &&
        Object.keys(parsedAttributes as Record<string, unknown>).length > 0 && (
        <SlideOverSection title="Parsed Attributes">
          <div className="bg-gray-50 rounded-md border border-gray-200 overflow-hidden">
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-gray-200">
                {Object.entries(parsedAttributes as Record<string, unknown>).map(([key, value]) => (
                  <tr key={key}>
                    <td className="px-3 py-2 text-gray-500 font-medium w-1/3">{key}</td>
                    <td className="px-3 py-2 text-gray-900 font-mono text-xs">
                      {typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SlideOverSection>
      )}

      {/* Source Record */}
      {!!sourceRecord && (
        <SlideOverSection title="Source Record">
          <div className="bg-gray-50 rounded-md p-3 overflow-x-auto border border-gray-200">
            <pre className="text-xs text-gray-700 font-mono">
              {JSON.stringify(sourceRecord, null, 2)}
            </pre>
          </div>
        </SlideOverSection>
      )}

      {/* Source Reference */}
      <SlideOverSection title="Source">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-500">Agent</span>
            <div className="font-mono text-xs">{item.agent_name || "—"}</div>
          </div>
          <div>
            <span className="text-gray-500">Table</span>
            <div className="font-mono text-xs">{item.source_table || "—"}</div>
          </div>
          <div>
            <span className="text-gray-500">Record ID</span>
            <div className="font-mono text-xs">{item.source_id || "—"}</div>
          </div>
          <div>
            <span className="text-gray-500">Status</span>
            <div className="font-mono text-xs">{item.status}</div>
          </div>
        </div>
      </SlideOverSection>

      {/* Timestamps */}
      <SlideOverSection title="Timestamps">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-500">Created</span>
            <div className="text-xs">{formatDate(item.created_at)}</div>
          </div>
          <div>
            <span className="text-gray-500">Updated</span>
            <div className="text-xs">{formatDate(item.updated_at)}</div>
          </div>
          {item.resolved_at && (
            <>
              <div>
                <span className="text-gray-500">Resolved</span>
                <div className="text-xs">{formatDate(item.resolved_at)}</div>
              </div>
              <div>
                <span className="text-gray-500">Resolved By</span>
                <div className="text-xs">{item.resolved_by || "—"}</div>
              </div>
            </>
          )}
        </div>
      </SlideOverSection>

      {/* Resolution Notes */}
      {item.resolved_notes && (
        <SlideOverSection title="Resolution Notes">
          <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
            <p className="text-sm text-gray-700">{item.resolved_notes}</p>
          </div>
        </SlideOverSection>
      )}

      {/* Full Details (collapsible) */}
      {Object.keys(details).length > 0 && (
        <SlideOverSection title="Full Details">
          <details className="group">
            <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800">
              Show raw details JSON
            </summary>
            <div className="mt-2 bg-gray-50 rounded-md p-3 overflow-x-auto border border-gray-200">
              <pre className="text-xs text-gray-700 font-mono">
                {JSON.stringify(details, null, 2)}
              </pre>
            </div>
          </details>
        </SlideOverSection>
      )}
    </SlideOver>
  );
}
