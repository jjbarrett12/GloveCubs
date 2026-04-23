'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ============================================================================
// TYPES
// ============================================================================

interface OutcomeSummary {
  total_outcomes: number;
  accepted_count: number;
  rejected_count: number;
  expired_count: number;
  superseded_count: number;
  pending_count: number;
  acceptance_rate: number;
  total_estimated_savings: number;
  total_realized_savings: number;
  savings_capture_rate: number;
}

interface Outcome {
  id: string;
  recommendation_id: string;
  product_id: string;
  supplier_id: string;
  outcome_status: string;
  decision_source: string;
  accepted_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
  selected_supplier_id?: string;
  recommended_price: number;
  selected_price?: number;
  estimated_savings?: number;
  realized_savings?: number;
  realized_savings_percent?: number;
  savings_confidence?: string;
  recommended_trust_score?: number;
  recommended_reasoning?: string;
  created_at: string;
}

interface TopSupplier {
  supplier_id: string;
  acceptance_count: number;
  avg_realized_savings: number;
  avg_trust_score: number;
  total_realized_savings: number;
}

interface OverriddenSupplier {
  supplier_id: string;
  rejection_count: number;
  acceptance_count: number;
  total_recommendations: number;
  rejection_rate_percent: number;
}

interface SavingsAccuracy {
  id: string;
  product_id: string;
  supplier_id: string;
  estimated_savings: number;
  realized_savings: number;
  savings_error: number;
  savings_error_percent: number;
  savings_confidence: string;
  accepted_at: string;
}

// ============================================================================
// COMPONENTS
// ============================================================================

function StatCard({ 
  title, 
  value, 
  subtitle, 
  color = 'default' 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  color?: 'default' | 'green' | 'yellow' | 'red' | 'blue';
}) {
  const colorClasses = {
    default: 'bg-gray-100 text-gray-900',
    green: 'bg-green-100 text-green-900',
    yellow: 'bg-yellow-100 text-yellow-900',
    red: 'bg-red-100 text-red-900',
    blue: 'bg-blue-100 text-blue-900',
  };
  
  return (
    <Card className={colorClasses[color]}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium opacity-80">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs opacity-70 mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-gray-400 text-white',
    accepted: 'bg-green-600 text-white',
    rejected: 'bg-red-600 text-white',
    superseded: 'bg-yellow-500 text-black',
    expired: 'bg-gray-500 text-white',
    partially_realized: 'bg-blue-500 text-white',
  };
  
  return (
    <Badge className={colors[status] || 'bg-gray-400 text-white'}>
      {status.replace('_', ' ')}
    </Badge>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string | undefined }) {
  if (!confidence) return null;
  
  const colors: Record<string, string> = {
    confirmed: 'bg-green-600 text-white',
    estimated: 'bg-yellow-500 text-black',
    unknown: 'bg-gray-400 text-white',
  };
  
  return (
    <Badge className={colors[confidence] || 'bg-gray-400 text-white'}>
      {confidence}
    </Badge>
  );
}

function formatCurrency(value: number | undefined | null): string {
  if (value == null) return '-';
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | undefined | null): string {
  if (value == null) return '-';
  return `${value.toFixed(1)}%`;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString();
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function RecommendationOutcomesPage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<OutcomeSummary | null>(null);
  const [accepted, setAccepted] = useState<Outcome[]>([]);
  const [rejected, setRejected] = useState<Outcome[]>([]);
  const [expiring, setExpiring] = useState<Outcome[]>([]);
  const [superseded, setSuperseded] = useState<Outcome[]>([]);
  const [topSuppliers, setTopSuppliers] = useState<TopSupplier[]>([]);
  const [overriddenSuppliers, setOverriddenSuppliers] = useState<OverriddenSupplier[]>([]);
  const [savingsAccuracy, setSavingsAccuracy] = useState<SavingsAccuracy[]>([]);
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    try {
      // Load summary via RPC
      const { data: summaryData } = await supabase.rpc('get_outcome_summary', {
        p_window_days: 30,
      });
      
      if (summaryData && summaryData[0]) {
        setSummary(summaryData[0] as OutcomeSummary);
      }
      
      // Load accepted recommendations
      const { data: acceptedData } = await supabase
        .from('accepted_recommendations')
        .select('*')
        .limit(30);
      
      if (acceptedData) {
        setAccepted(acceptedData as Outcome[]);
      }
      
      // Load rejected recommendations
      const { data: rejectedData } = await supabase
        .from('rejected_recommendations')
        .select('*')
        .limit(30);
      
      if (rejectedData) {
        setRejected(rejectedData as Outcome[]);
      }
      
      // Load expiring recommendations
      const { data: expiringData } = await supabase
        .from('expiring_recommendations')
        .select('*')
        .limit(20);
      
      if (expiringData) {
        setExpiring(expiringData as Outcome[]);
      }
      
      // Load superseded
      const { data: supersededData } = await supabase
        .from('superseded_recommendations')
        .select('*')
        .limit(20);
      
      if (supersededData) {
        setSuperseded(supersededData as Outcome[]);
      }
      
      // Load top accepted suppliers
      const { data: topData } = await supabase
        .from('top_accepted_suppliers')
        .select('*')
        .limit(10);
      
      if (topData) {
        setTopSuppliers(topData as TopSupplier[]);
      }
      
      // Load most overridden suppliers
      const { data: overriddenData } = await supabase
        .from('most_overridden_suppliers')
        .select('*')
        .limit(10);
      
      if (overriddenData) {
        setOverriddenSuppliers(overriddenData as OverriddenSupplier[]);
      }
      
      // Load savings accuracy
      const { data: accuracyData } = await supabase
        .from('savings_accuracy')
        .select('*')
        .limit(20);
      
      if (accuracyData) {
        setSavingsAccuracy(accuracyData as SavingsAccuracy[]);
      }
      
    } catch (error) {
      console.error('Failed to load outcomes data:', error);
    } finally {
      setLoading(false);
    }
  }
  
  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Recommendation Outcomes</h1>
        <p>Loading...</p>
      </div>
    );
  }
  
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Recommendation Outcomes</h1>
        <p className="text-gray-600 mt-1">Track actual outcomes and closed-loop learning</p>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <StatCard
          title="Acceptance Rate"
          value={`${summary?.acceptance_rate?.toFixed(1) || 0}%`}
          subtitle={`${summary?.accepted_count || 0} accepted / ${(summary?.accepted_count || 0) + (summary?.rejected_count || 0)} decided`}
          color={summary?.acceptance_rate && summary.acceptance_rate >= 70 ? 'green' : 'yellow'}
        />
        <StatCard
          title="Pending"
          value={summary?.pending_count || 0}
          subtitle="Awaiting decision"
          color={summary?.pending_count && summary.pending_count > 20 ? 'yellow' : 'default'}
        />
        <StatCard
          title="Rejected"
          value={summary?.rejected_count || 0}
          subtitle="Last 30 days"
          color={summary?.rejected_count && summary.rejected_count > 10 ? 'red' : 'default'}
        />
        <StatCard
          title="Estimated Savings"
          value={formatCurrency(summary?.total_estimated_savings)}
          subtitle="From accepted recommendations"
          color="blue"
        />
        <StatCard
          title="Realized Savings"
          value={formatCurrency(summary?.total_realized_savings)}
          subtitle={`${summary?.savings_capture_rate?.toFixed(0) || 0}% capture rate`}
          color={summary?.savings_capture_rate && summary.savings_capture_rate >= 80 ? 'green' : 'yellow'}
        />
      </div>
      
      {/* Detail Modal */}
      {selectedOutcome && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recommendation Detail</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setSelectedOutcome(null)}>
                Close
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <StatusBadge status={selectedOutcome.outcome_status} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Decision Source</p>
                  <p className="font-medium">{selectedOutcome.decision_source || '-'}</p>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Original Recommendation</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Trust Score</p>
                    <p className="font-medium">{((selectedOutcome.recommended_trust_score || 0) * 100).toFixed(0)}%</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Recommended Price</p>
                    <p className="font-medium">{formatCurrency(selectedOutcome.recommended_price)}</p>
                  </div>
                </div>
                {selectedOutcome.recommended_reasoning && (
                  <div className="mt-2">
                    <p className="text-gray-500">Reasoning</p>
                    <p className="text-sm bg-gray-50 p-2 rounded">{selectedOutcome.recommended_reasoning}</p>
                  </div>
                )}
              </div>
              
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Outcome</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Selected Price</p>
                    <p className="font-medium">{formatCurrency(selectedOutcome.selected_price)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Savings Confidence</p>
                    <ConfidenceBadge confidence={selectedOutcome.savings_confidence} />
                  </div>
                </div>
                {selectedOutcome.rejection_reason && (
                  <div className="mt-2">
                    <p className="text-gray-500">Rejection Reason</p>
                    <p className="text-sm bg-red-50 p-2 rounded text-red-800">{selectedOutcome.rejection_reason}</p>
                  </div>
                )}
                {selectedOutcome.selected_supplier_id && selectedOutcome.selected_supplier_id !== selectedOutcome.supplier_id && (
                  <div className="mt-2">
                    <p className="text-gray-500">Alternative Selected</p>
                    <p className="text-sm">Supplier: {selectedOutcome.selected_supplier_id.slice(0, 8)}...</p>
                  </div>
                )}
              </div>
              
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Savings</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Estimated</p>
                    <p className="font-medium">{formatCurrency(selectedOutcome.estimated_savings)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Realized</p>
                    <p className="font-medium">{formatCurrency(selectedOutcome.realized_savings)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Realized %</p>
                    <p className="font-medium">{formatPercent(selectedOutcome.realized_savings_percent)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Tabs */}
      <Tabs defaultValue="accepted" className="space-y-4">
        <TabsList>
          <TabsTrigger value="accepted">Accepted ({accepted.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejected.length})</TabsTrigger>
          <TabsTrigger value="expiring">Expiring ({expiring.length})</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="savings">Savings Accuracy</TabsTrigger>
        </TabsList>
        
        {/* Accepted Tab */}
        <TabsContent value="accepted">
          <Card>
            <CardHeader>
              <CardTitle>Accepted Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              {accepted.length === 0 ? (
                <p className="text-gray-500">No accepted recommendations</p>
              ) : (
                <div className="space-y-2">
                  {accepted.map(outcome => (
                    <div 
                      key={outcome.id} 
                      className="p-3 border rounded hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedOutcome(outcome)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={outcome.outcome_status} />
                            <ConfidenceBadge confidence={outcome.savings_confidence} />
                            <span className="text-sm text-gray-500">
                              {formatDate(outcome.accepted_at)}
                            </span>
                          </div>
                          <p className="text-sm mt-1">
                            Product: {outcome.product_id.slice(0, 8)}... | 
                            Supplier: {outcome.supplier_id.slice(0, 8)}...
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-green-600">
                            {formatCurrency(outcome.realized_savings || outcome.estimated_savings)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {outcome.realized_savings ? 'realized' : 'estimated'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Rejected Tab */}
        <TabsContent value="rejected">
          <Card>
            <CardHeader>
              <CardTitle>Rejected Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              {rejected.length === 0 ? (
                <p className="text-gray-500">No rejected recommendations</p>
              ) : (
                <div className="space-y-2">
                  {rejected.map(outcome => (
                    <div 
                      key={outcome.id} 
                      className="p-3 border border-red-200 rounded bg-red-50 cursor-pointer"
                      onClick={() => setSelectedOutcome(outcome)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={outcome.outcome_status} />
                            <span className="text-sm text-gray-500">
                              {formatDate(outcome.rejected_at)}
                            </span>
                          </div>
                          <p className="text-sm mt-1">
                            Supplier: {outcome.supplier_id.slice(0, 8)}...
                          </p>
                          {outcome.rejection_reason && (
                            <p className="text-sm text-red-700 mt-1">
                              <strong>Reason:</strong> {outcome.rejection_reason}
                            </p>
                          )}
                        </div>
                        <div className="text-right text-sm">
                          <p>Recommended: {formatCurrency(outcome.recommended_price)}</p>
                          {outcome.selected_price && (
                            <p>Selected: {formatCurrency(outcome.selected_price)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Expiring Tab */}
        <TabsContent value="expiring">
          <Card>
            <CardHeader>
              <CardTitle className="text-yellow-600">Pending Recommendations Nearing Expiration</CardTitle>
            </CardHeader>
            <CardContent>
              {expiring.length === 0 ? (
                <p className="text-gray-500">No expiring recommendations</p>
              ) : (
                <div className="space-y-2">
                  {expiring.map(outcome => (
                    <div 
                      key={outcome.id} 
                      className="p-3 border border-yellow-200 rounded bg-yellow-50"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            Product: {outcome.product_id.slice(0, 8)}... | 
                            Supplier: {outcome.supplier_id.slice(0, 8)}...
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Created: {formatDate(outcome.created_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm">Est. Savings: {formatCurrency(outcome.estimated_savings)}</p>
                          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                            Expiring Soon
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Suppliers Tab */}
        <TabsContent value="suppliers">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-green-600">Top Accepted Suppliers</CardTitle>
              </CardHeader>
              <CardContent>
                {topSuppliers.length === 0 ? (
                  <p className="text-gray-500">No data available</p>
                ) : (
                  <div className="space-y-2">
                    {topSuppliers.map((supplier, idx) => (
                      <div key={supplier.supplier_id} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-gray-500">#{idx + 1}</span>
                          <span className="font-medium text-sm">
                            {supplier.supplier_id.slice(0, 8)}...
                          </span>
                        </div>
                        <div className="text-right text-sm">
                          <p className="font-bold text-green-600">{supplier.acceptance_count} accepted</p>
                          <p className="text-gray-500">
                            Avg savings: {formatCurrency(supplier.avg_realized_savings)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-red-600">Most Overridden Suppliers</CardTitle>
              </CardHeader>
              <CardContent>
                {overriddenSuppliers.length === 0 ? (
                  <p className="text-gray-500">No overridden suppliers</p>
                ) : (
                  <div className="space-y-2">
                    {overriddenSuppliers.map(supplier => (
                      <div key={supplier.supplier_id} className="p-2 border border-red-200 rounded bg-red-50">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">
                            {supplier.supplier_id.slice(0, 8)}...
                          </span>
                          <div className="text-right text-sm">
                            <p className="font-bold text-red-600">
                              {supplier.rejection_rate_percent}% rejection rate
                            </p>
                            <p className="text-gray-500">
                              {supplier.rejection_count} / {supplier.total_recommendations} rejected
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Savings Accuracy Tab */}
        <TabsContent value="savings">
          <Card>
            <CardHeader>
              <CardTitle>Estimated vs Realized Savings</CardTitle>
            </CardHeader>
            <CardContent>
              {savingsAccuracy.length === 0 ? (
                <p className="text-gray-500">No savings accuracy data available</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Product</th>
                        <th className="text-right p-2">Estimated</th>
                        <th className="text-right p-2">Realized</th>
                        <th className="text-right p-2">Error</th>
                        <th className="text-center p-2">Confidence</th>
                        <th className="text-left p-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savingsAccuracy.map(item => (
                        <tr key={item.id} className="border-b hover:bg-gray-50">
                          <td className="p-2 font-mono text-xs">
                            {item.product_id.slice(0, 8)}...
                          </td>
                          <td className="p-2 text-right">
                            {formatCurrency(item.estimated_savings)}
                          </td>
                          <td className="p-2 text-right font-medium">
                            {formatCurrency(item.realized_savings)}
                          </td>
                          <td className={`p-2 text-right ${item.savings_error < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(item.savings_error)}
                            <span className="text-xs text-gray-500 ml-1">
                              ({formatPercent(item.savings_error_percent)})
                            </span>
                          </td>
                          <td className="p-2 text-center">
                            <ConfidenceBadge confidence={item.savings_confidence} />
                          </td>
                          <td className="p-2 text-xs text-gray-500">
                            {formatDate(item.accepted_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
