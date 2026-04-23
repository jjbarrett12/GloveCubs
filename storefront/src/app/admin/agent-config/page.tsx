/**
 * Admin Agent Configuration Dashboard
 * 
 * View and manage agent settings and rules
 */

import { Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  PageHeader,
  StatCard,
  StatGrid,
  TableCard,
  EmptyState,
  LoadingState,
} from "@/components/admin";
import { AgentConfigClient } from "./AgentConfigClient";

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

interface AgentConfig {
  id: string;
  agent_name: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface AgentRule {
  id: string;
  agent_name: string;
  rule_key: string;
  rule_value: unknown;
  description: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

async function getSystemStatus() {
  const supabase = await getSupabase();

  const [jobsResult, reviewsResult, lastAuditResult] = await Promise.all([
    supabase.from("job_queue").select("status").in("status", ["pending", "running"]),
    supabase.from("review_queue").select("id").in("status", ["open", "in_review"]),
    supabase
      .from("audit_reports")
      .select("created_at, status")
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const jobs = jobsResult.data || [];
  return {
    pendingJobs: jobs.filter((j) => j.status === "pending").length,
    runningJobs: jobs.filter((j) => j.status === "running").length,
    pendingReviews: reviewsResult.data?.length || 0,
    lastAudit: lastAuditResult.data,
  };
}

async function getAgentData() {
  const supabase = await getSupabase();

  const [configsResult, rulesResult] = await Promise.all([
    supabase.from("agent_config").select("*").order("agent_name"),
    supabase.from("agent_rules").select("*").order("agent_name").order("rule_key"),
  ]);

  return {
    configs: (configsResult.data || []) as AgentConfig[],
    rules: (rulesResult.data || []) as AgentRule[],
  };
}

function SystemStatus({
  status,
}: {
  status: {
    pendingJobs: number;
    runningJobs: number;
    pendingReviews: number;
    lastAudit: { created_at: string; status: string } | null;
  };
}) {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <StatGrid columns={4}>
      <StatCard
        label="Pending Jobs"
        value={status.pendingJobs}
        color="blue"
        href="/admin/jobs?status=pending"
      />
      <StatCard
        label="Running Jobs"
        value={status.runningJobs}
        color="green"
        href="/admin/jobs?status=running"
      />
      <StatCard
        label="Pending Reviews"
        value={status.pendingReviews}
        color="orange"
        href="/admin/review"
      />
      <StatCard
        label="Last Audit"
        value={status.lastAudit ? formatDate(status.lastAudit.created_at) : "Never"}
        color={status.lastAudit?.status === "completed" ? "green" : "red"}
        href="/admin/audit-reports"
      />
    </StatGrid>
  );
}

async function AgentConfigContent() {
  const [status, agentData] = await Promise.all([getSystemStatus(), getAgentData()]);

  if (agentData.configs.length === 0) {
    return (
      <>
        <div className="mb-6">
          <SystemStatus status={status} />
        </div>
        <TableCard>
          <EmptyState
            icon={
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
            }
            title="No agents configured"
            description="Agent configurations will appear here once set up"
          />
        </TableCard>
      </>
    );
  }

  return (
    <>
      <div className="mb-6">
        <SystemStatus status={status} />
      </div>
      <AgentConfigClient configs={agentData.configs} rules={agentData.rules} />
    </>
  );
}

export default function AdminAgentConfigPage() {
  return (
    <div>
      <PageHeader
        title="Agent Configuration"
        description="Manage agent settings, rules, and system status"
      />

      <Suspense fallback={<LoadingState message="Loading configuration..." />}>
        <AgentConfigContent />
      </Suspense>
    </div>
  );
}
