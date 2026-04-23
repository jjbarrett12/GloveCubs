'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ============================================================================
// TYPES
// ============================================================================

interface DashboardSummary {
  supplier_name: string;
  reliability: { score: number; band: string; trend: string };
  trust: { avg_score: number; high_trust_count: number; low_trust_count: number };
  offers: { total: number; active: number; stale: number; fresh: number };
  competitiveness: { avg_rank: number; rank_1_count: number; price_percentile: number };
  alerts: { unread: number; critical: number };
}

interface UploadMetrics {
  last_upload_at?: string;
  last_upload_filename?: string;
  last_upload_summary?: { created: number; updated: number; skipped: number };
  total_uploads_30d: number;
  total_rows_processed_30d: number;
  avg_error_rate: number;
}

interface ExtractionConfidence {
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
  total_extractions: number;
  fields_by_confidence: Record<string, number>;
}

interface ValidationWarnings {
  price_anomaly: number;
  pack_mismatch: number;
  duplicate: number;
  low_confidence: number;
  total: number;
}

interface CorrectionMetrics {
  total_corrections_30d: number;
  rows_with_multiple_corrections: number;
  most_corrected_fields: Array<{ field: string; count: number }>;
}

interface CompetitivenessMetrics {
  avg_rank: number;
  rank_1_count: number;
  rank_2_3_count: number;
  low_rank_count: number;
  low_trust_count: number;
  trust_adjusted_position: number;
  products_close_to_winning: number;
}

interface LostOpportunity {
  type: string;
  product_id: string;
  product_name?: string;
  offer_id: string;
  current_rank: number;
  potential_rank: number;
  impact_score: number;
  reason: string;
  recommended_action: string;
}

interface NearWin {
  product_id: string;
  product_name?: string;
  offer_id: string;
  current_rank: number;
  gap_to_rank_1: { price_gap: number; trust_gap: number; freshness_gap_days: number };
  blocking_factors: string[];
  improvement_suggestions: string[];
}

interface ActionItem {
  id: string;
  priority: string;
  category: string;
  title: string;
  description: string;
  affected_offers: number;
  potential_impact: string;
  action_url?: string;
  action_label?: string;
}

interface UploadHistoryItem {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  total_rows: number;
  processed_rows: number;
  error_rows: number;
  created_at: string;
  summary: { created: number; warnings: number; errors: number };
}

// ============================================================================
// COMPONENTS
// ============================================================================

function StatCard({ 
  title, 
  value, 
  subtitle, 
  trend,
  color = 'default' 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string;
  trend?: 'improving' | 'stable' | 'declining';
  color?: 'default' | 'green' | 'yellow' | 'red' | 'blue';
}) {
  const colorClasses = {
    default: 'bg-white border-gray-200',
    green: 'bg-green-50 border-green-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    red: 'bg-red-50 border-red-200',
    blue: 'bg-blue-50 border-blue-200',
  };
  
  const trendIcons = { improving: '↑', stable: '→', declining: '↓' };
  const trendColors = { improving: 'text-green-600', stable: 'text-gray-600', declining: 'text-red-600' };
  
  return (
    <Card className={`${colorClasses[color]} border`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">{value}</span>
          {trend && <span className={`text-lg ${trendColors[trend]}`}>{trendIcons[trend]}</span>}
        </div>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-600 text-white',
    high: 'bg-orange-500 text-white',
    medium: 'bg-yellow-500 text-black',
    low: 'bg-gray-400 text-white',
  };
  return <Badge className={colors[priority] || 'bg-gray-400'}>{priority}</Badge>;
}

function OpportunityTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    low_trust: 'bg-red-100 text-red-800',
    stale_offer: 'bg-yellow-100 text-yellow-800',
    anomaly_penalty: 'bg-orange-100 text-orange-800',
    missing_fields: 'bg-blue-100 text-blue-800',
    price_uncompetitive: 'bg-purple-100 text-purple-800',
  };
  return <Badge className={colors[type] || 'bg-gray-100'}>{type.replace('_', ' ')}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    committed: 'bg-green-100 text-green-800',
    preview: 'bg-blue-100 text-blue-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-gray-100 text-gray-800',
  };
  return <Badge className={colors[status] || 'bg-gray-100'}>{status}</Badge>;
}

function ConfidenceBar({ high, medium, low }: { high: number; medium: number; low: number }) {
  const total = high + medium + low;
  if (total === 0) return <div className="text-gray-400 text-sm">No data</div>;
  
  const highPct = (high / total) * 100;
  const mediumPct = (medium / total) * 100;
  const lowPct = (low / total) * 100;
  
  return (
    <div className="space-y-1">
      <div className="h-4 rounded-full overflow-hidden flex bg-gray-100">
        <div className="bg-green-500" style={{ width: `${highPct}%` }} title={`High: ${high}`} />
        <div className="bg-yellow-500" style={{ width: `${mediumPct}%` }} title={`Medium: ${medium}`} />
        <div className="bg-red-500" style={{ width: `${lowPct}%` }} title={`Low: ${low}`} />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>High: {highPct.toFixed(0)}%</span>
        <span>Medium: {mediumPct.toFixed(0)}%</span>
        <span>Low: {lowPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function ImpactBar({ score }: { score: number }) {
  const width = Math.min(100, score);
  const color = score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-yellow-500' : 'bg-green-500';
  
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs text-gray-600 w-8">{score.toFixed(0)}</span>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function SupplierDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [uploadMetrics, setUploadMetrics] = useState<UploadMetrics | null>(null);
  const [extractionConfidence, setExtractionConfidence] = useState<ExtractionConfidence | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<ValidationWarnings | null>(null);
  const [correctionMetrics, setCorrectionMetrics] = useState<CorrectionMetrics | null>(null);
  const [competitivenessMetrics, setCompetitivenessMetrics] = useState<CompetitivenessMetrics | null>(null);
  const [lostOpportunities, setLostOpportunities] = useState<LostOpportunity[]>([]);
  const [nearWins, setNearWins] = useState<NearWin[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [uploadHistory, setUploadHistory] = useState<UploadHistoryItem[]>([]);
  
  useEffect(() => {
    checkAuthAndLoadData();
  }, []);
  
  async function checkAuthAndLoadData() {
    try {
      const authRes = await fetch('/supplier-portal/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate' }),
      });
      
      if (!authRes.ok) {
        router.push('/supplier-portal/login');
        return;
      }
      
      // Load all dashboard data in parallel
      const [
        summaryRes,
        uploadMetricsRes,
        extractionRes,
        validationRes,
        correctionRes,
        competitivenessRes,
        lostRes,
        nearWinsRes,
        actionsRes,
        historyRes,
      ] = await Promise.all([
        fetch('/supplier-portal/api/dashboard?endpoint=summary'),
        fetch('/supplier-portal/api/dashboard?endpoint=upload-metrics'),
        fetch('/supplier-portal/api/dashboard?endpoint=extraction-confidence'),
        fetch('/supplier-portal/api/dashboard?endpoint=validation-warnings'),
        fetch('/supplier-portal/api/dashboard?endpoint=correction-metrics'),
        fetch('/supplier-portal/api/dashboard?endpoint=competitiveness-metrics'),
        fetch('/supplier-portal/api/dashboard?endpoint=lost-opportunities&limit=10'),
        fetch('/supplier-portal/api/dashboard?endpoint=near-wins&limit=5'),
        fetch('/supplier-portal/api/dashboard?endpoint=action-items'),
        fetch('/supplier-portal/api/dashboard?endpoint=upload-history&limit=10'),
      ]);
      
      if (summaryRes.ok) setSummary((await summaryRes.json()).data);
      if (uploadMetricsRes.ok) setUploadMetrics((await uploadMetricsRes.json()).data);
      if (extractionRes.ok) setExtractionConfidence((await extractionRes.json()).data);
      if (validationRes.ok) setValidationWarnings((await validationRes.json()).data);
      if (correctionRes.ok) setCorrectionMetrics((await correctionRes.json()).data);
      if (competitivenessRes.ok) setCompetitivenessMetrics((await competitivenessRes.json()).data);
      if (lostRes.ok) setLostOpportunities((await lostRes.json()).data);
      if (nearWinsRes.ok) setNearWins((await nearWinsRes.json()).data);
      if (actionsRes.ok) setActionItems((await actionsRes.json()).data);
      if (historyRes.ok) setUploadHistory((await historyRes.json()).data);
      
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }
  
  async function handleLogout() {
    await fetch('/supplier-portal/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    router.push('/supplier-portal/login');
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading your intelligence dashboard...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Supplier Intelligence Dashboard</h1>
            <p className="text-sm text-gray-500">{summary?.supplier_name}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => router.push('/supplier-portal/upload')}>
              Upload Feed
            </Button>
            {summary?.alerts.unread ? (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => router.push('/supplier-portal/alerts')}
                className={summary.alerts.critical > 0 ? 'border-red-300 text-red-600' : ''}
              >
                {summary.alerts.unread} Alerts
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="max-w-7xl mx-auto px-4 flex gap-6 border-t border-gray-100">
          <button className="py-3 border-b-2 border-blue-600 text-blue-600 font-medium text-sm">Dashboard</button>
          <button className="py-3 text-gray-600 hover:text-gray-900 text-sm" onClick={() => router.push('/supplier-portal/offers')}>Offers</button>
          <button className="py-3 text-gray-600 hover:text-gray-900 text-sm" onClick={() => router.push('/supplier-portal/competitiveness')}>Competitiveness</button>
          <button className="py-3 text-gray-600 hover:text-gray-900 text-sm" onClick={() => router.push('/supplier-portal/feed-health')}>Feed Health</button>
          <button className="py-3 text-gray-600 hover:text-gray-900 text-sm" onClick={() => router.push('/supplier-portal/upload')}>Upload</button>
        </nav>
      </header>
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-white border">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="feed-health">Feed Health</TabsTrigger>
            <TabsTrigger value="competitiveness">Competitiveness</TabsTrigger>
            <TabsTrigger value="opportunities">Lost Opportunities</TabsTrigger>
            <TabsTrigger value="actions">Action Center</TabsTrigger>
            <TabsTrigger value="uploads">Upload History</TabsTrigger>
          </TabsList>
          
          {/* ============================================================ */}
          {/* OVERVIEW TAB */}
          {/* ============================================================ */}
          <TabsContent value="overview" className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <StatCard
                title="Reliability Score"
                value={summary ? `${(summary.reliability.score * 100).toFixed(0)}%` : '-'}
                subtitle={summary?.reliability.band}
                trend={summary?.reliability.trend as 'improving' | 'stable' | 'declining'}
                color={summary?.reliability.band === 'trusted' ? 'green' : summary?.reliability.band === 'risky' ? 'red' : 'default'}
              />
              <StatCard
                title="Avg Trust Score"
                value={summary ? `${(summary.trust.avg_score * 100).toFixed(0)}%` : '-'}
                subtitle={`${summary?.trust.high_trust_count || 0} high trust`}
                color={(summary?.trust.avg_score || 0) >= 0.7 ? 'green' : 'default'}
              />
              <StatCard
                title="Active Offers"
                value={summary?.offers.active || 0}
                subtitle={`${summary?.offers.fresh || 0} fresh`}
                color="blue"
              />
              <StatCard
                title="Stale Offers"
                value={summary?.offers.stale || 0}
                subtitle="30+ days old"
                color={(summary?.offers.stale || 0) > 5 ? 'red' : 'default'}
              />
              <StatCard
                title="Avg Rank"
                value={competitivenessMetrics ? competitivenessMetrics.avg_rank.toFixed(1) : '-'}
                subtitle={`${competitivenessMetrics?.rank_1_count || 0} #1 positions`}
                color={(competitivenessMetrics?.avg_rank || 5) <= 2 ? 'green' : 'default'}
              />
              <StatCard
                title="Last Upload"
                value={uploadMetrics?.last_upload_at ? formatRelativeTime(uploadMetrics.last_upload_at) : 'Never'}
                subtitle={uploadMetrics?.last_upload_filename}
              />
            </div>
            
            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Latest Upload Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Latest Upload Summary</CardTitle>
                  <CardDescription>
                    {uploadMetrics?.last_upload_filename || 'No recent uploads'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {uploadMetrics?.last_upload_summary ? (
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-4 bg-green-50 rounded-lg">
                        <p className="text-2xl font-bold text-green-600">{uploadMetrics.last_upload_summary.created}</p>
                        <p className="text-sm text-gray-600">Created</p>
                      </div>
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <p className="text-2xl font-bold text-blue-600">{uploadMetrics.last_upload_summary.updated}</p>
                        <p className="text-sm text-gray-600">Updated</p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-2xl font-bold text-gray-600">{uploadMetrics.last_upload_summary.skipped}</p>
                        <p className="text-sm text-gray-600">Skipped</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-gray-500 mb-4">Upload your first feed to get started</p>
                      <Button onClick={() => router.push('/supplier-portal/upload')}>Upload Now</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              {/* Action Items Preview */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Action Items</CardTitle>
                    <CardDescription>{actionItems.length} items need attention</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {actionItems.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No action items - great job!</p>
                  ) : (
                    <div className="space-y-3">
                      {actionItems.slice(0, 4).map(item => (
                        <div key={item.id} className="flex items-start justify-between p-3 border rounded-lg">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <PriorityBadge priority={item.priority} />
                              <span className="font-medium text-sm">{item.title}</span>
                            </div>
                            <p className="text-xs text-gray-500">{item.description}</p>
                          </div>
                          {item.action_url && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => router.push(item.action_url!)}
                            >
                              {item.action_label || 'Fix'}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* Near Wins */}
            {nearWins.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Almost Winning</CardTitle>
                  <CardDescription>Products where you're close to #1 - small improvements could win the deal</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {nearWins.slice(0, 3).map(win => (
                      <div key={win.product_id} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium">{win.product_name || win.product_id.slice(0, 8)}</p>
                            <Badge variant="outline">Current Rank #{win.current_rank}</Badge>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                          <div>
                            <span className="text-gray-500">Price Gap: </span>
                            <span className={win.gap_to_rank_1.price_gap > 0 ? 'text-red-600' : 'text-green-600'}>
                              {win.gap_to_rank_1.price_gap > 0 ? '+' : ''}${win.gap_to_rank_1.price_gap.toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Trust Gap: </span>
                            <span className={win.gap_to_rank_1.trust_gap < 0 ? 'text-red-600' : 'text-green-600'}>
                              {(win.gap_to_rank_1.trust_gap * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Freshness: </span>
                            <span className={win.gap_to_rank_1.freshness_gap_days > 0 ? 'text-yellow-600' : 'text-green-600'}>
                              {win.gap_to_rank_1.freshness_gap_days > 0 ? `${win.gap_to_rank_1.freshness_gap_days}d behind` : 'Good'}
                            </span>
                          </div>
                        </div>
                        {win.improvement_suggestions.length > 0 && (
                          <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                            {win.improvement_suggestions[0]}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          {/* ============================================================ */}
          {/* FEED HEALTH TAB */}
          {/* ============================================================ */}
          <TabsContent value="feed-health" className="space-y-6">
            {/* Feed Health Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-600">30-Day Uploads</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{uploadMetrics?.total_uploads_30d || 0}</p>
                  <p className="text-xs text-gray-500">{uploadMetrics?.total_rows_processed_30d || 0} rows</p>
                </CardContent>
              </Card>
              <Card className="bg-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-600">Avg Error Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`text-3xl font-bold ${(uploadMetrics?.avg_error_rate || 0) > 0.1 ? 'text-red-600' : 'text-green-600'}`}>
                    {((uploadMetrics?.avg_error_rate || 0) * 100).toFixed(1)}%
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-600">Corrections (30d)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`text-3xl font-bold ${(correctionMetrics?.total_corrections_30d || 0) > 10 ? 'text-yellow-600' : ''}`}>
                    {correctionMetrics?.total_corrections_30d || 0}
                  </p>
                  <p className="text-xs text-gray-500">{correctionMetrics?.rows_with_multiple_corrections || 0} repeat</p>
                </CardContent>
              </Card>
              <Card className="bg-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-600">Validation Warnings</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`text-3xl font-bold ${(validationWarnings?.total || 0) > 20 ? 'text-red-600' : ''}`}>
                    {validationWarnings?.total || 0}
                  </p>
                </CardContent>
              </Card>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Extraction Confidence */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Extraction Confidence</CardTitle>
                  <CardDescription>How confidently we extracted data from your uploads</CardDescription>
                </CardHeader>
                <CardContent>
                  {extractionConfidence && extractionConfidence.total_extractions > 0 ? (
                    <div className="space-y-4">
                      <ConfidenceBar 
                        high={extractionConfidence.high_confidence}
                        medium={extractionConfidence.medium_confidence}
                        low={extractionConfidence.low_confidence}
                      />
                      <div className="grid grid-cols-2 gap-2 pt-4 border-t">
                        {Object.entries(extractionConfidence.fields_by_confidence).map(([field, confidence]) => (
                          <div key={field} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                            <span className="text-gray-600">{field}</span>
                            <span className={confidence >= 0.9 ? 'text-green-600' : confidence >= 0.7 ? 'text-yellow-600' : 'text-red-600'}>
                              {(confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">No extraction data available</p>
                  )}
                </CardContent>
              </Card>
              
              {/* Validation Warning Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Validation Warnings</CardTitle>
                  <CardDescription>Issues detected in your uploads</CardDescription>
                </CardHeader>
                <CardContent>
                  {validationWarnings && validationWarnings.total > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                        <span className="text-red-800">Price Anomalies</span>
                        <Badge className="bg-red-600">{validationWarnings.price_anomaly}</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                        <span className="text-yellow-800">Pack Mismatches</span>
                        <Badge className="bg-yellow-600">{validationWarnings.pack_mismatch}</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                        <span className="text-blue-800">Duplicates</span>
                        <Badge className="bg-blue-600">{validationWarnings.duplicate}</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-800">Low Confidence</span>
                        <Badge className="bg-gray-600">{validationWarnings.low_confidence}</Badge>
                      </div>
                    </div>
                  ) : (
                    <p className="text-green-600 text-center py-8">No validation warnings - clean data!</p>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* Most Corrected Fields */}
            {correctionMetrics && correctionMetrics.most_corrected_fields.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Most Corrected Fields</CardTitle>
                  <CardDescription>Fields that needed manual correction most often</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {correctionMetrics.most_corrected_fields.map(f => (
                      <div key={f.field} className="text-center p-4 bg-yellow-50 rounded-lg">
                        <p className="text-2xl font-bold text-yellow-600">{f.count}</p>
                        <p className="text-sm text-gray-600">{f.field}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          {/* ============================================================ */}
          {/* COMPETITIVENESS TAB */}
          {/* ============================================================ */}
          <TabsContent value="competitiveness" className="space-y-6">
            {/* Competitiveness Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard
                title="Avg Rank"
                value={competitivenessMetrics?.avg_rank.toFixed(1) || '-'}
                color={(competitivenessMetrics?.avg_rank || 5) <= 2 ? 'green' : 'default'}
              />
              <StatCard
                title="#1 Rankings"
                value={competitivenessMetrics?.rank_1_count || 0}
                color="green"
              />
              <StatCard
                title="#2-3 Rankings"
                value={competitivenessMetrics?.rank_2_3_count || 0}
                subtitle="Close to winning"
                color="blue"
              />
              <StatCard
                title="Low Rank"
                value={competitivenessMetrics?.low_rank_count || 0}
                subtitle="Rank 4+"
                color={(competitivenessMetrics?.low_rank_count || 0) > 10 ? 'red' : 'default'}
              />
              <StatCard
                title="Low Trust"
                value={competitivenessMetrics?.low_trust_count || 0}
                subtitle="Hurting rank"
                color={(competitivenessMetrics?.low_trust_count || 0) > 5 ? 'red' : 'default'}
              />
            </div>
            
            {/* Near Wins Detail */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Almost Winning</CardTitle>
                <CardDescription>Products where you're rank 2-3 and could win with improvements</CardDescription>
              </CardHeader>
              <CardContent>
                {nearWins.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No near-win opportunities found</p>
                ) : (
                  <div className="space-y-4">
                    {nearWins.map(win => (
                      <div key={win.product_id} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-medium text-lg">{win.product_name || win.product_id.slice(0, 12)}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline">Current: #{win.current_rank}</Badge>
                              {win.blocking_factors.map((factor, i) => (
                                <Badge key={i} className="bg-red-100 text-red-800">{factor}</Badge>
                              ))}
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => router.push('/supplier-portal/offers')}>
                            Edit Offer
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm bg-gray-50 p-3 rounded mb-3">
                          <div>
                            <p className="text-gray-500">Price Gap</p>
                            <p className={`font-medium ${win.gap_to_rank_1.price_gap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {win.gap_to_rank_1.price_gap > 0 ? '+' : ''}${win.gap_to_rank_1.price_gap.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Trust Gap</p>
                            <p className={`font-medium ${win.gap_to_rank_1.trust_gap < 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {(win.gap_to_rank_1.trust_gap * 100).toFixed(0)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Freshness</p>
                            <p className={`font-medium ${win.gap_to_rank_1.freshness_gap_days > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                              {win.gap_to_rank_1.freshness_gap_days > 0 ? `${win.gap_to_rank_1.freshness_gap_days}d older` : 'Current'}
                            </p>
                          </div>
                        </div>
                        {win.improvement_suggestions.length > 0 && (
                          <div className="text-sm text-blue-800 bg-blue-50 p-3 rounded">
                            <p className="font-medium mb-1">To Win:</p>
                            <ul className="list-disc list-inside space-y-1">
                              {win.improvement_suggestions.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* ============================================================ */}
          {/* LOST OPPORTUNITIES TAB */}
          {/* ============================================================ */}
          <TabsContent value="opportunities" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Lost Opportunities</CardTitle>
                <CardDescription>Rankings you're losing due to data quality, pricing, or freshness issues</CardDescription>
              </CardHeader>
              <CardContent>
                {lostOpportunities.length === 0 ? (
                  <p className="text-green-600 text-center py-8">No lost opportunities identified - great job!</p>
                ) : (
                  <div className="space-y-4">
                    {lostOpportunities.map((opp, i) => (
                      <div key={`${opp.offer_id}-${i}`} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <OpportunityTypeBadge type={opp.type} />
                              <span className="font-medium">{opp.product_name || opp.product_id.slice(0, 12)}</span>
                            </div>
                            <p className="text-sm text-gray-600">{opp.reason}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-500">Rank</p>
                            <p className="font-medium">
                              #{opp.current_rank} → <span className="text-green-600">#{opp.potential_rank}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex-1 mr-4">
                            <p className="text-xs text-gray-500 mb-1">Impact Score</p>
                            <ImpactBar score={opp.impact_score} />
                          </div>
                          <Button variant="outline" size="sm" onClick={() => router.push('/supplier-portal/offers')}>
                            Fix Now
                          </Button>
                        </div>
                        <p className="text-xs text-blue-600 mt-2">{opp.recommended_action}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* ============================================================ */}
          {/* ACTION CENTER TAB */}
          {/* ============================================================ */}
          <TabsContent value="actions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Action Center</CardTitle>
                <CardDescription>Prioritized actions to improve your ranking and data quality</CardDescription>
              </CardHeader>
              <CardContent>
                {actionItems.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-5xl mb-4">🎉</div>
                    <p className="text-xl font-medium text-green-600 mb-2">All Clear!</p>
                    <p className="text-gray-500">No action items - your data is in great shape.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {actionItems.map(item => (
                      <div key={item.id} className={`p-4 border rounded-lg ${
                        item.priority === 'critical' ? 'border-red-300 bg-red-50' :
                        item.priority === 'high' ? 'border-orange-300 bg-orange-50' : ''
                      }`}>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <PriorityBadge priority={item.priority} />
                              <span className="font-medium">{item.title}</span>
                            </div>
                            <p className="text-sm text-gray-600">{item.description}</p>
                          </div>
                          {item.action_url && (
                            <Button 
                              variant={item.priority === 'critical' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => router.push(item.action_url!)}
                            >
                              {item.action_label || 'Take Action'}
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-gray-500">
                            {item.affected_offers} offers affected
                          </span>
                          <span className="text-blue-600">
                            {item.potential_impact}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* ============================================================ */}
          {/* UPLOAD HISTORY TAB */}
          {/* ============================================================ */}
          <TabsContent value="uploads" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Upload History</CardTitle>
                  <CardDescription>Recent feed uploads and their results</CardDescription>
                </div>
                <Button onClick={() => router.push('/supplier-portal/upload')}>
                  New Upload
                </Button>
              </CardHeader>
              <CardContent>
                {uploadHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500 mb-4">No uploads yet</p>
                    <Button onClick={() => router.push('/supplier-portal/upload')}>Upload Your First Feed</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {uploadHistory.map(upload => (
                      <div key={upload.id} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium">{upload.filename}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <StatusBadge status={upload.status} />
                              <span className="text-sm text-gray-500">{formatDate(upload.created_at)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-5 gap-4 text-center text-sm mt-3 pt-3 border-t">
                          <div>
                            <p className="text-gray-500">Total</p>
                            <p className="font-medium">{upload.total_rows}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Processed</p>
                            <p className="font-medium">{upload.processed_rows}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Created</p>
                            <p className="font-medium text-green-600">{upload.summary.created}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Warnings</p>
                            <p className={`font-medium ${upload.summary.warnings > 0 ? 'text-yellow-600' : ''}`}>
                              {upload.summary.warnings}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Errors</p>
                            <p className={`font-medium ${upload.summary.errors > 0 ? 'text-red-600' : ''}`}>
                              {upload.summary.errors}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
