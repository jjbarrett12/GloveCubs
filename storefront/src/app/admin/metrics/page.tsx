'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatCard, StatGrid } from '@/components/admin/StatCard';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { createBrowserClient } from '@supabase/ssr';

interface DailyMetrics {
  run_date: string;
  metric_type: string;
  metric_key: string;
  jobs_completed: number;
  jobs_failed: number;
  jobs_blocked: number;
  total_duration_ms: number;
  avg_duration_ms: number;
  max_duration_ms: number;
  error_count: number;
  products_processed: number;
  offers_created: number;
  review_items_created: number;
  computed_at: string;
}

interface JobTypeMetrics {
  job_type: string;
  completed: number;
  failed: number;
  blocked: number;
  avg_duration_ms: number;
  error_rate: number;
}

export default function PipelineMetricsPage() {
  const [metrics, setMetrics] = useState<DailyMetrics[]>([]);
  const [jobTypeMetrics, setJobTypeMetrics] = useState<JobTypeMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  useEffect(() => {
    loadMetrics();
  }, [selectedDate]);

  async function loadMetrics() {
    setLoading(true);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Load daily summary
    const { data: dailyData } = await supabase
      .from('pipeline_metrics')
      .select('*')
      .eq('run_date', selectedDate)
      .eq('metric_type', 'daily_summary')
      .single();

    // Load job type summaries
    const { data: jobData } = await supabase
      .from('pipeline_metrics')
      .select('*')
      .eq('run_date', selectedDate)
      .eq('metric_type', 'job_type_summary')
      .order('jobs_completed', { ascending: false });

    if (dailyData) {
      setMetrics([dailyData]);
    }

    if (jobData) {
      setJobTypeMetrics(
        jobData.map((m: DailyMetrics) => ({
          job_type: m.metric_key,
          completed: m.jobs_completed,
          failed: m.jobs_failed,
          blocked: m.jobs_blocked,
          avg_duration_ms: m.avg_duration_ms,
          error_rate: m.jobs_completed + m.jobs_failed > 0
            ? (m.jobs_failed / (m.jobs_completed + m.jobs_failed)) * 100
            : 0,
        }))
      );
    }

    setLoading(false);
  }

  const dailySummary = metrics[0];
  const totalJobs = dailySummary
    ? dailySummary.jobs_completed + dailySummary.jobs_failed + dailySummary.jobs_blocked
    : 0;
  const successRate = totalJobs > 0
    ? ((dailySummary?.jobs_completed || 0) / totalJobs) * 100
    : 0;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <PageHeader
        title="Pipeline Metrics"
        description="Daily pipeline performance and health metrics"
      />

      {/* Date Selector */}
      <div className="mb-6">
        <label className="text-sm font-medium mr-2">Select Date:</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border rounded px-3 py-1 text-sm"
        />
      </div>

      {/* Summary Stats */}
      <StatGrid columns={4} className="mb-8">
        <StatCard
          label="Total Jobs"
          value={totalJobs}
          color="blue"
        />
        <StatCard
          label="Success Rate"
          value={`${successRate.toFixed(1)}%`}
          color={successRate >= 95 ? 'green' : successRate >= 80 ? 'amber' : 'red'}
        />
        <StatCard
          label="Failed Jobs"
          value={dailySummary?.jobs_failed || 0}
          color={(dailySummary?.jobs_failed || 0) > 0 ? 'red' : 'green'}
        />
        <StatCard
          label="Avg Duration"
          value={`${((dailySummary?.avg_duration_ms || 0) / 1000).toFixed(1)}s`}
          color="default"
        />
      </StatGrid>

      {/* Job Type Breakdown */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">Job Type Breakdown</h2>
        </div>
        
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : jobTypeMetrics.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No metrics for selected date
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Job Type
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Completed
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Failed
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Blocked
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Avg Duration
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Health
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {jobTypeMetrics.map((jt) => (
                  <tr key={jt.job_type} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {jt.job_type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600">
                      {jt.completed}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">
                      {jt.failed}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-yellow-600">
                      {jt.blocked}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      {(jt.avg_duration_ms / 1000).toFixed(2)}s
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <StatusBadge
                        status={
                          jt.error_rate === 0
                            ? 'success'
                            : jt.error_rate < 5
                            ? 'warning'
                            : 'critical'
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Last 7 Days Trend (placeholder) */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">7-Day Trend</h2>
        </div>
        <div className="p-6 text-center text-gray-500">
          <p>Coming soon: Job volume and success rate trends</p>
        </div>
      </div>
    </div>
  );
}
