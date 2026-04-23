"use client";

/**
 * Audit Reports Client Component
 * 
 * Interactive audit report list with expandable details
 */

import { useState } from "react";
import { StatusBadge, SlideOver, SlideOverSection } from "@/components/admin";

interface AuditSummary {
  records_audited: number;
  issues_found: number;
  safe_auto_fixes_applied: number;
  items_sent_to_review: number;
  items_blocked: number;
  systemic_issues_found: number;
}

interface AuditModuleResult {
  module: string;
  records_checked: number;
  issues_found: number;
  fixes_applied: number;
  review_items_created: number;
  blocked_items: number;
  notes: string[];
}

interface AuditSystemicIssue {
  issue: string;
  impact: string;
  recommended_fix: string;
}

interface AuditReport {
  id: string;
  run_type: string;
  status: "completed" | "failed";
  summary: AuditSummary;
  module_results: AuditModuleResult[];
  fixes: unknown[];
  review_items: unknown[];
  blocked_actions: unknown[];
  systemic_issues: AuditSystemicIssue[];
  next_steps: string[];
  self_audit: {
    passed: boolean;
    validation_notes: string[];
  } | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export function AuditReportsClient({ reports }: { reports: AuditReport[] }) {
  const [selectedReport, setSelectedReport] = useState<AuditReport | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const formatDate = (date: string | null) => {
    if (!date) return null;
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start || !end) return null;
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  return (
    <>
      {/* Report List */}
      <div className="space-y-3">
        {reports.map((report) => {
          const isExpanded = expandedId === report.id;
          const s = report.summary;

          return (
            <div
              key={report.id}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden"
            >
              {/* Header row */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : report.id)}
                className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                {/* Expand icon */}
                <button className="text-gray-400 hover:text-gray-600">
                  <svg
                    className={`w-5 h-5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>

                {/* Status */}
                <StatusBadge status={report.status === "completed" ? "success" : "error"} />

                {/* Date & type */}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    {formatDate(report.created_at)}
                  </div>
                  <div className="text-xs text-gray-500">{report.run_type}</div>
                </div>

                {/* Summary stats */}
                <div className="hidden md:flex items-center gap-6 text-xs">
                  <StatPill label="Audited" value={s.records_audited} />
                  <StatPill label="Issues" value={s.issues_found} color="amber" />
                  <StatPill label="Auto-Fixed" value={s.safe_auto_fixes_applied} color="green" />
                  <StatPill label="To Review" value={s.items_sent_to_review} color="orange" />
                  <StatPill label="Blocked" value={s.items_blocked} color="red" />
                  {s.systemic_issues_found > 0 && (
                    <StatPill label="Systemic" value={s.systemic_issues_found} color="purple" />
                  )}
                </div>

                {/* Duration */}
                <div className="text-xs text-gray-400 font-mono">
                  {formatDuration(report.started_at, report.completed_at) || "—"}
                </div>

                {/* View details */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedReport(report);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  View
                </button>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-4 bg-gray-50">
                  {/* Summary cards - mobile friendly */}
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4 md:hidden">
                    <MiniStat label="Audited" value={s.records_audited} />
                    <MiniStat label="Issues" value={s.issues_found} color="amber" />
                    <MiniStat label="Fixed" value={s.safe_auto_fixes_applied} color="green" />
                    <MiniStat label="Review" value={s.items_sent_to_review} color="orange" />
                    <MiniStat label="Blocked" value={s.items_blocked} color="red" />
                    <MiniStat label="Systemic" value={s.systemic_issues_found} color="purple" />
                  </div>

                  {/* Module results table */}
                  {report.module_results && report.module_results.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Module Results
                      </h4>
                      <div className="bg-white rounded border border-gray-200 overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Module</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Checked</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Issues</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Fixed</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Review</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Blocked</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {report.module_results.map((mod, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-3 py-2 font-mono text-xs">{mod.module}</td>
                                <td className="px-3 py-2 text-right text-gray-600">{mod.records_checked}</td>
                                <td className="px-3 py-2 text-right text-amber-600">{mod.issues_found}</td>
                                <td className="px-3 py-2 text-right text-green-600">{mod.fixes_applied}</td>
                                <td className="px-3 py-2 text-right text-orange-600">{mod.review_items_created}</td>
                                <td className="px-3 py-2 text-right text-red-600">{mod.blocked_items}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Systemic issues */}
                  {report.systemic_issues && report.systemic_issues.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-xs font-medium text-red-600 uppercase tracking-wide mb-2">
                        Systemic Issues
                      </h4>
                      <div className="space-y-2">
                        {report.systemic_issues.map((issue, i) => (
                          <div key={i} className="bg-red-50 border border-red-200 rounded-md p-3">
                            <p className="text-sm font-medium text-red-800">{issue.issue}</p>
                            <p className="text-xs text-red-700 mt-1">{issue.impact}</p>
                            <p className="text-xs text-red-600 mt-1">
                              <span className="font-medium">Fix:</span> {issue.recommended_fix}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Next steps */}
                  {report.next_steps && report.next_steps.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Next Steps
                      </h4>
                      <ul className="text-sm text-gray-700 space-y-1">
                        {report.next_steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-gray-400">→</span>
                            {step}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Detail Slide-Over */}
      <SlideOver
        open={!!selectedReport}
        onClose={() => setSelectedReport(null)}
        title={selectedReport ? `Audit: ${formatDate(selectedReport.created_at)}` : "Audit Details"}
        subtitle={selectedReport?.run_type}
        width="xl"
      >
        {selectedReport && (
          <>
            <SlideOverSection title="Summary">
              <div className="grid grid-cols-3 gap-4">
                <MiniStat label="Audited" value={selectedReport.summary.records_audited} />
                <MiniStat label="Issues" value={selectedReport.summary.issues_found} color="amber" />
                <MiniStat label="Fixed" value={selectedReport.summary.safe_auto_fixes_applied} color="green" />
                <MiniStat label="Review" value={selectedReport.summary.items_sent_to_review} color="orange" />
                <MiniStat label="Blocked" value={selectedReport.summary.items_blocked} color="red" />
                <MiniStat label="Systemic" value={selectedReport.summary.systemic_issues_found} color="purple" />
              </div>
            </SlideOverSection>

            <SlideOverSection title="Timing">
              <dl className="text-sm">
                <div className="flex justify-between py-1">
                  <dt className="text-gray-500">Started</dt>
                  <dd className="text-gray-900">{formatDate(selectedReport.started_at)}</dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-gray-500">Completed</dt>
                  <dd className="text-gray-900">{formatDate(selectedReport.completed_at)}</dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-gray-500">Duration</dt>
                  <dd className="text-gray-900 font-mono">
                    {formatDuration(selectedReport.started_at, selectedReport.completed_at)}
                  </dd>
                </div>
              </dl>
            </SlideOverSection>

            {selectedReport.self_audit && (
              <SlideOverSection title="Self Audit">
                <div className={`p-3 rounded-md ${
                  selectedReport.self_audit.passed ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <StatusBadge status={selectedReport.self_audit.passed ? "success" : "error"} />
                    <span className="text-sm font-medium">
                      {selectedReport.self_audit.passed ? "Passed" : "Failed"}
                    </span>
                  </div>
                  {selectedReport.self_audit.validation_notes?.length > 0 && (
                    <ul className="text-xs space-y-1">
                      {selectedReport.self_audit.validation_notes.map((note, i) => (
                        <li key={i} className="text-gray-600">{note}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </SlideOverSection>
            )}
          </>
        )}
      </SlideOver>
    </>
  );
}

function StatPill({
  label,
  value,
  color = "default",
}: {
  label: string;
  value: number;
  color?: "default" | "amber" | "green" | "orange" | "red" | "purple";
}) {
  const colors = {
    default: "text-gray-900",
    amber: "text-amber-600",
    green: "text-emerald-600",
    orange: "text-orange-600",
    red: "text-red-600",
    purple: "text-purple-600",
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-gray-500">{label}:</span>
      <span className={`font-medium tabular-nums ${colors[color]}`}>{value}</span>
    </div>
  );
}

function MiniStat({
  label,
  value,
  color = "default",
}: {
  label: string;
  value: number;
  color?: "default" | "amber" | "green" | "orange" | "red" | "purple";
}) {
  const colors = {
    default: "text-gray-900",
    amber: "text-amber-600",
    green: "text-emerald-600",
    orange: "text-orange-600",
    red: "text-red-600",
    purple: "text-purple-600",
  };

  return (
    <div className="text-center">
      <div className={`text-lg font-semibold tabular-nums ${colors[color]}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
