/**
 * Admin Audit Reports Dashboard
 * 
 * View audit run history and results
 */

import { Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  PageHeader,
  TableCard,
  EmptyState,
  LoadingState,
} from "@/components/admin";
import { AuditReportsClient } from "./AuditReportsClient";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

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

async function getAuditReports(): Promise<AuditReport[]> {
  const supabase = await getSupabase();
  
  const { data, error } = await supabase
    .from("audit_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  
  if (error) throw error;
  return (data || []) as AuditReport[];
}

async function AuditContent() {
  const reports = await getAuditReports();

  if (reports.length === 0) {
    return (
      <TableCard>
        <EmptyState
          icon={
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
          }
          title="No audit reports"
          description="Audit reports will appear here after audits run"
        />
      </TableCard>
    );
  }

  return <AuditReportsClient reports={reports} />;
}

export default function AdminAuditReportsPage() {
  return (
    <div>
      <PageHeader
        title="Audit Reports"
        description="QA Supervisor audit run history and results"
        actions={
          <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
            Run Audit Now
          </button>
        }
      />

      <Suspense fallback={<LoadingState message="Loading reports..." />}>
        <AuditContent />
      </Suspense>
    </div>
  );
}
