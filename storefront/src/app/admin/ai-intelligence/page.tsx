'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatCard, StatGrid } from '@/components/admin/StatCard';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { createBrowserClient } from '@supabase/ssr';

interface OpsSummary {
  id: string;
  run_type: string;
  run_date: string;
  summary_text: string;
  highlights: Array<{
    category: string;
    title: string;
    detail: string;
    severity: number;
  }>;
  metrics: {
    total_processed: number;
    successful: number;
    failed: number;
    sent_to_review: number;
  };
  created_at: string;
}

interface FeedbackStats {
  total: number;
  correct: number;
  accuracy: number;
}

interface SynonymCandidate {
  id: string;
  field_name: string;
  raw_term: string;
  normalized_term: string;
  confidence: number;
  source: string;
  verified: boolean;
}

interface LLMUsageStats {
  daily_cost: number;
  daily_limit: number;
  requests_today: number;
  enabled: boolean;
}

interface PerformanceMetric {
  metric_type: string;
  metric_value: number;
  sample_size: number;
  created_at: string;
}

interface LearningCandidate {
  id: string;
  type: string;
  field_name?: string;
  original_value?: string;
  corrected_value?: string;
  occurrence_count: number;
  recommended_action: string;
}

export default function AIIntelligencePage() {
  const [summaries, setSummaries] = useState<OpsSummary[]>([]);
  const [feedbackStats, setFeedbackStats] = useState<Record<string, FeedbackStats>>({});
  const [synonymCandidates, setSynonymCandidates] = useState<SynonymCandidate[]>([]);
  const [llmUsage, setLlmUsage] = useState<LLMUsageStats | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetric[]>([]);
  const [learningCandidates, setLearningCandidates] = useState<LearningCandidate[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'metrics' | 'learning' | 'llm'>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Load ops summaries
    const { data: summaryData } = await supabase
      .from('ai_ops_summaries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (summaryData) {
      setSummaries(summaryData);
    }

    // Load feedback stats by type
    const { data: feedbackData } = await supabase
      .from('ai_feedback')
      .select('feedback_type, was_correct')
      .gte('corrected_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (feedbackData) {
      const stats: Record<string, FeedbackStats> = {};
      for (const fb of feedbackData) {
        if (!stats[fb.feedback_type]) {
          stats[fb.feedback_type] = { total: 0, correct: 0, accuracy: 0 };
        }
        stats[fb.feedback_type].total++;
        if (fb.was_correct) {
          stats[fb.feedback_type].correct++;
        }
      }
      for (const type of Object.keys(stats)) {
        stats[type].accuracy = stats[type].total > 0 
          ? stats[type].correct / stats[type].total 
          : 0;
      }
      setFeedbackStats(stats);
    }

    // Load unverified synonym candidates
    const { data: synonymData } = await supabase
      .from('ai_synonyms')
      .select('*')
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(20);

    if (synonymData) {
      setSynonymCandidates(synonymData);
    }

    // Load LLM usage stats
    const today = new Date().toISOString().split('T')[0];
    const { data: llmData } = await supabase
      .from('ai_llm_usage')
      .select('cost_estimate, request_type')
      .gte('created_at', today);

    const { data: llmConfig } = await supabase
      .from('agent_rules')
      .select('rule_key, rule_value')
      .eq('agent_name', 'ai_system');

    if (llmData && llmConfig) {
      const configMap = new Map(llmConfig.map(c => [c.rule_key, c.rule_value]));
      const dailyCost = llmData.reduce((sum, r) => sum + Number(r.cost_estimate || 0), 0);
      setLlmUsage({
        daily_cost: dailyCost,
        daily_limit: parseFloat(configMap.get('daily_llm_cost_limit') || '10'),
        requests_today: llmData.length,
        enabled: configMap.get('llm_escalation_enabled') === 'true',
      });
    }

    // Load performance metrics
    const { data: metricsData } = await supabase
      .from('ai_performance_metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (metricsData) {
      setPerformanceMetrics(metricsData);
    }

    setLoading(false);
  }

  async function verifySynonym(id: string, verified: boolean) {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    await supabase
      .from('ai_synonyms')
      .update({ 
        verified, 
        verified_at: new Date().toISOString(),
        confidence: verified ? 0.95 : 0.3,
      })
      .eq('id', id);

    loadData();
  }

  const totalFeedback = Object.values(feedbackStats).reduce((a, b) => a + b.total, 0);
  const totalCorrect = Object.values(feedbackStats).reduce((a, b) => a + b.correct, 0);
  const overallAccuracy = totalFeedback > 0 ? totalCorrect / totalFeedback : 0;

  // Group metrics by type
  const metricsByType = performanceMetrics.reduce((acc, m) => {
    if (!acc[m.metric_type]) acc[m.metric_type] = [];
    acc[m.metric_type].push(m);
    return acc;
  }, {} as Record<string, PerformanceMetric[]>);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <PageHeader
        title="AI Intelligence"
        description="AI reasoning, learning, and operational summaries"
      />

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-8">
          {(['overview', 'metrics', 'learning', 'llm'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab === 'llm' ? 'LLM Escalation' : tab}
            </button>
          ))}
        </nav>
      </div>

      {/* AI Accuracy Stats */}
      <StatGrid columns={5} className="mb-8">
        <StatCard
          label="Overall AI Accuracy"
          value={`${(overallAccuracy * 100).toFixed(1)}%`}
          color={overallAccuracy >= 0.85 ? 'green' : overallAccuracy >= 0.7 ? 'amber' : 'red'}
        />
        <StatCard
          label="Total Feedback"
          value={totalFeedback}
          color="blue"
        />
        <StatCard
          label="Synonym Candidates"
          value={synonymCandidates.length}
          color="purple"
        />
        <StatCard
          label="LLM Requests Today"
          value={llmUsage?.requests_today || 0}
          color={llmUsage?.enabled ? 'green' : 'default'}
        />
        <StatCard
          label="LLM Cost Today"
          value={`$${(llmUsage?.daily_cost || 0).toFixed(4)}`}
          color={(llmUsage?.daily_cost || 0) > (llmUsage?.daily_limit || 10) * 0.8 ? 'amber' : 'default'}
        />
      </StatGrid>

      {/* LLM Status Banner */}
      {llmUsage && (
        <div className={`mb-6 p-4 rounded-lg ${
          llmUsage.enabled 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-amber-50 border border-amber-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${llmUsage.enabled ? 'bg-green-500' : 'bg-amber-500'}`}></span>
              <span className="font-medium">
                LLM Escalation: {llmUsage.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="text-sm text-gray-600">
              Budget: ${llmUsage.daily_cost.toFixed(4)} / ${llmUsage.daily_limit.toFixed(2)} daily limit
            </div>
          </div>
          {llmUsage.daily_cost > llmUsage.daily_limit * 0.8 && (
            <p className="text-sm text-amber-700 mt-2">
              Warning: Approaching daily LLM cost limit
            </p>
          )}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <>
          {/* Feedback by Type */}
          {Object.keys(feedbackStats).length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold">AI Accuracy by Type (Last 30 Days)</h2>
              </div>
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(feedbackStats).map(([type, stats]) => (
                  <div key={type} className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="text-sm text-gray-500 capitalize">{type}</div>
                    <div className={`text-2xl font-bold ${stats.accuracy >= 0.85 ? 'text-green-600' : stats.accuracy >= 0.7 ? 'text-amber-600' : 'text-red-600'}`}>
                      {(stats.accuracy * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-gray-400">{stats.correct}/{stats.total} correct</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Ops Summaries */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Recent Pipeline Summaries</h2>
            </div>
            
            {loading ? (
              <div className="p-6 text-center text-gray-500">Loading...</div>
            ) : summaries.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No summaries yet</div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {summaries.map((summary) => (
                  <div key={summary.id} className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={summary.run_type} />
                        <span className="text-sm text-gray-500">{summary.run_date}</span>
                      </div>
                      <div className="text-sm text-gray-400">
                        {new Date(summary.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                    <p className="text-sm mb-3">{summary.summary_text}</p>
                    
                    {summary.highlights.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {summary.highlights.map((h, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                              h.category === 'critical' ? 'bg-red-100 text-red-800' :
                              h.category === 'warning' ? 'bg-amber-100 text-amber-800' :
                              h.category === 'success' ? 'bg-green-100 text-green-800' :
                              'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {h.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'metrics' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold">Performance Metrics History</h2>
            <p className="text-sm text-gray-500">AI accuracy and performance over time</p>
          </div>
          
          {Object.keys(metricsByType).length === 0 ? (
            <div className="p-6 text-center text-gray-500">No metrics recorded yet</div>
          ) : (
            <div className="p-6 space-y-6">
              {Object.entries(metricsByType).map(([type, metrics]) => (
                <div key={type} className="border-b border-gray-100 pb-4 last:border-0">
                  <h3 className="font-medium text-sm uppercase text-gray-500 mb-3">{type.replace(/_/g, ' ')}</h3>
                  <div className="flex items-center gap-4">
                    <div className="text-2xl font-bold">
                      {(Number(metrics[0]?.metric_value || 0) * 100).toFixed(1)}%
                    </div>
                    <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                      <div 
                        className={`h-full ${
                          Number(metrics[0]?.metric_value || 0) >= 0.8 ? 'bg-green-500' :
                          Number(metrics[0]?.metric_value || 0) >= 0.6 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Number(metrics[0]?.metric_value || 0) * 100}%` }}
                      />
                    </div>
                    <div className="text-sm text-gray-500">
                      {metrics[0]?.sample_size || 0} samples
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'learning' && (
        <>
          {/* Synonym Candidates for Verification */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Synonym Candidates (Need Verification)</h2>
              <p className="text-sm text-gray-500">
                These synonyms were learned from human corrections. Verify to add to production dictionary.
              </p>
            </div>
            
            {synonymCandidates.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No pending synonym candidates</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Field</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Raw Term</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">→ Normalized</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {synonymCandidates.map((syn) => (
                      <tr key={syn.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className="px-2 py-1 bg-gray-100 rounded text-xs">{syn.field_name}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-red-600">
                          {syn.raw_term}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-green-600">
                          {syn.normalized_term}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {syn.source}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => verifySynonym(syn.id, true)}
                            className="px-3 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200 mr-2"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => verifySynonym(syn.id, false)}
                            className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200"
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'llm' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">LLM Escalation Configuration</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-sm text-gray-500">Status</div>
                  <div className={`text-lg font-semibold ${llmUsage?.enabled ? 'text-green-600' : 'text-amber-600'}`}>
                    {llmUsage?.enabled ? 'Active' : 'Disabled'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Daily Budget</div>
                  <div className="text-lg font-semibold">${llmUsage?.daily_limit?.toFixed(2) || '10.00'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Spent Today</div>
                  <div className="text-lg font-semibold">${llmUsage?.daily_cost?.toFixed(4) || '0.0000'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Requests Today</div>
                  <div className="text-lg font-semibold">{llmUsage?.requests_today || 0}</div>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-medium text-blue-800 mb-2">Escalation Thresholds</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-blue-600">Extraction:</span> &lt; 65% confidence
                  </div>
                  <div>
                    <span className="text-blue-600">Matching:</span> &lt; 70% confidence
                  </div>
                  <div>
                    <span className="text-blue-600">Pricing:</span> &lt; 65% confidence
                  </div>
                </div>
              </div>
              
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium text-gray-700 mb-2">Safety Rules</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• LLM cannot override hard constraints (material, size, sterile, thickness, pack qty)</li>
                  <li>• LLM confidence is capped at 85% to prevent over-reliance</li>
                  <li>• Hard constraint conflicts force review even if LLM suggests match</li>
                  <li>• Cost guard automatically disables escalation if daily limit exceeded</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
