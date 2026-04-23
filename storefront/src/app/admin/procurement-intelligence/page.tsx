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

interface SupplierReliability {
  supplier_id: string;
  reliability_score: number;
  reliability_band: string;
  completeness_score: number;
  freshness_score: number;
  accuracy_score: number;
  sample_size: number;
}

interface LowTrustOffer {
  offer_id: string;
  supplier_id: string;
  product_id: string;
  trust_score: number;
  trust_band: string;
}

interface MarginOpportunity {
  product_id: string;
  opportunity_band: string;
  estimated_savings_percent: number | null;
  market_spread: number;
  requires_review: boolean;
  reasoning: string;
}

interface ProcurementAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  summary: string;
  recommended_action: string;
  status: string;
  created_at: string;
}

interface MetricsSummary {
  reliability: { avg_score: number; trusted_count: number; risky_count: number; sample_size: number };
  trust: { avg_score: number; high_trust_count: number; low_trust_count: number; sample_size: number };
  opportunities: { major_count: number; total_potential_savings: number; sample_size: number };
  alerts: { open_count: number; critical_count: number; resolved_today: number };
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

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-600 text-white',
    high: 'bg-orange-500 text-white',
    normal: 'bg-blue-500 text-white',
    low: 'bg-gray-400 text-white',
  };
  
  return (
    <Badge className={colors[severity] || colors.normal}>
      {severity}
    </Badge>
  );
}

function BandBadge({ band, type }: { band: string; type: 'reliability' | 'trust' | 'opportunity' }) {
  const reliabilityColors: Record<string, string> = {
    trusted: 'bg-green-600 text-white',
    stable: 'bg-blue-500 text-white',
    watch: 'bg-yellow-500 text-black',
    risky: 'bg-red-600 text-white',
  };
  
  const trustColors: Record<string, string> = {
    high_trust: 'bg-green-600 text-white',
    medium_trust: 'bg-blue-500 text-white',
    review_sensitive: 'bg-yellow-500 text-black',
    low_trust: 'bg-red-600 text-white',
  };
  
  const opportunityColors: Record<string, string> = {
    major: 'bg-green-600 text-white',
    meaningful: 'bg-blue-500 text-white',
    minor: 'bg-gray-400 text-white',
    none: 'bg-gray-300 text-gray-700',
  };
  
  const colors = type === 'reliability' ? reliabilityColors : type === 'trust' ? trustColors : opportunityColors;
  
  return (
    <Badge className={colors[band] || 'bg-gray-400 text-white'}>
      {band.replace('_', ' ')}
    </Badge>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function ProcurementIntelligencePage() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierReliability[]>([]);
  const [riskySuppliers, setRiskySuppliers] = useState<SupplierReliability[]>([]);
  const [lowTrustOffers, setLowTrustOffers] = useState<LowTrustOffer[]>([]);
  const [opportunities, setOpportunities] = useState<MarginOpportunity[]>([]);
  const [alerts, setAlerts] = useState<ProcurementAlert[]>([]);

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
      // Load supplier leaderboard
      const { data: supplierData } = await supabase
        .from('supplier_reliability_leaderboard')
        .select('*')
        .limit(20);
      
      if (supplierData) {
        setSuppliers(supplierData as SupplierReliability[]);
        setRiskySuppliers(
          (supplierData as SupplierReliability[])
            .filter(s => s.reliability_band === 'risky' || s.reliability_band === 'watch')
        );
      }
      
      // Load low trust offers
      const { data: trustData } = await supabase
        .from('low_trust_winners')
        .select('*')
        .limit(20);
      
      if (trustData) {
        setLowTrustOffers(trustData as LowTrustOffer[]);
      }
      
      // Load margin opportunities
      const { data: oppData } = await supabase
        .from('top_margin_opportunities')
        .select('*')
        .limit(20);
      
      if (oppData) {
        setOpportunities(oppData as MarginOpportunity[]);
      }
      
      // Load alerts
      const { data: alertData } = await supabase
        .from('active_procurement_alerts')
        .select('*')
        .limit(30);
      
      if (alertData) {
        setAlerts(alertData as ProcurementAlert[]);
      }
      
      // Calculate summary metrics
      const summary: MetricsSummary = {
        reliability: {
          avg_score: supplierData?.length 
            ? supplierData.reduce((s, d) => s + Number(d.reliability_score), 0) / supplierData.length 
            : 0,
          trusted_count: supplierData?.filter(d => d.reliability_band === 'trusted').length || 0,
          risky_count: supplierData?.filter(d => d.reliability_band === 'risky' || d.reliability_band === 'watch').length || 0,
          sample_size: supplierData?.length || 0,
        },
        trust: {
          avg_score: trustData?.length 
            ? trustData.reduce((s, d) => s + Number(d.trust_score), 0) / trustData.length 
            : 0,
          high_trust_count: trustData?.filter(d => d.trust_band === 'high_trust').length || 0,
          low_trust_count: trustData?.length || 0,
          sample_size: trustData?.length || 0,
        },
        opportunities: {
          major_count: oppData?.filter(d => d.opportunity_band === 'major').length || 0,
          total_potential_savings: oppData?.reduce((s, d) => s + (Number(d.estimated_savings_percent) || 0), 0) || 0,
          sample_size: oppData?.length || 0,
        },
        alerts: {
          open_count: alertData?.length || 0,
          critical_count: alertData?.filter(d => d.severity === 'critical').length || 0,
          resolved_today: 0,
        },
      };
      
      setMetrics(summary);
    } catch (error) {
      console.error('Failed to load procurement data:', error);
    } finally {
      setLoading(false);
    }
  }
  
  async function handleResolveAlert(alertId: string) {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase
      .from('procurement_alerts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', alertId);
    
    setAlerts(alerts.filter(a => a.id !== alertId));
  }
  
  async function handleDismissAlert(alertId: string) {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase
      .from('procurement_alerts')
      .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
      .eq('id', alertId);
    
    setAlerts(alerts.filter(a => a.id !== alertId));
  }
  
  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Procurement Intelligence</h1>
        <p>Loading...</p>
      </div>
    );
  }
  
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Procurement Intelligence</h1>
        <p className="text-gray-600 mt-1">Trust scoring, opportunities, and alerts</p>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Avg Supplier Reliability"
          value={`${((metrics?.reliability.avg_score || 0) * 100).toFixed(0)}%`}
          subtitle={`${metrics?.reliability.trusted_count} trusted, ${metrics?.reliability.risky_count} at risk`}
          color={metrics?.reliability.avg_score && metrics.reliability.avg_score >= 0.7 ? 'green' : 'yellow'}
        />
        <StatCard
          title="Low Trust Offers"
          value={metrics?.trust.low_trust_count || 0}
          subtitle="Winning positions requiring review"
          color={metrics?.trust.low_trust_count ? 'red' : 'green'}
        />
        <StatCard
          title="Major Opportunities"
          value={metrics?.opportunities.major_count || 0}
          subtitle={`${metrics?.opportunities.sample_size} total analyzed`}
          color={metrics?.opportunities.major_count ? 'blue' : 'default'}
        />
        <StatCard
          title="Active Alerts"
          value={metrics?.alerts.open_count || 0}
          subtitle={`${metrics?.alerts.critical_count} critical`}
          color={metrics?.alerts.critical_count ? 'red' : metrics?.alerts.open_count ? 'yellow' : 'green'}
        />
      </div>
      
      {/* Tabs */}
      <Tabs defaultValue="alerts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="alerts">Alerts ({alerts.length})</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers ({suppliers.length})</TabsTrigger>
          <TabsTrigger value="trust">Low Trust ({lowTrustOffers.length})</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities ({opportunities.length})</TabsTrigger>
        </TabsList>
        
        {/* Alerts Tab */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>Active Procurement Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <p className="text-gray-500">No active alerts</p>
              ) : (
                <div className="space-y-4">
                  {alerts.map(alert => (
                    <div key={alert.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <SeverityBadge severity={alert.severity} />
                            <Badge variant="outline">{alert.alert_type.replace('_', ' ')}</Badge>
                          </div>
                          <h3 className="font-semibold">{alert.title}</h3>
                          <p className="text-sm text-gray-600 mt-1">{alert.summary}</p>
                          <p className="text-sm text-blue-600 mt-2">
                            <strong>Action:</strong> {alert.recommended_action}
                          </p>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleDismissAlert(alert.id)}
                          >
                            Dismiss
                          </Button>
                          <Button 
                            size="sm"
                            onClick={() => handleResolveAlert(alert.id)}
                          >
                            Resolve
                          </Button>
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
            {/* Leaderboard */}
            <Card>
              <CardHeader>
                <CardTitle>Reliability Leaderboard</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {suppliers.slice(0, 10).map((supplier, idx) => (
                    <div key={supplier.supplier_id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-gray-500">#{idx + 1}</span>
                        <span className="font-medium text-sm truncate max-w-[150px]">
                          {supplier.supplier_id.slice(0, 8)}...
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">
                          {(supplier.reliability_score * 100).toFixed(0)}%
                        </span>
                        <BandBadge band={supplier.reliability_band} type="reliability" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            {/* Risky Suppliers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-red-600">Risky Suppliers</CardTitle>
              </CardHeader>
              <CardContent>
                {riskySuppliers.length === 0 ? (
                  <p className="text-gray-500">No risky suppliers detected</p>
                ) : (
                  <div className="space-y-3">
                    {riskySuppliers.map(supplier => (
                      <div key={supplier.supplier_id} className="p-3 border border-red-200 rounded bg-red-50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">
                            {supplier.supplier_id.slice(0, 8)}...
                          </span>
                          <BandBadge band={supplier.reliability_band} type="reliability" />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500">Completeness:</span>
                            <span className="ml-1 font-medium">{(supplier.completeness_score * 100).toFixed(0)}%</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Freshness:</span>
                            <span className="ml-1 font-medium">{(supplier.freshness_score * 100).toFixed(0)}%</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Accuracy:</span>
                            <span className="ml-1 font-medium">{(supplier.accuracy_score * 100).toFixed(0)}%</span>
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
        
        {/* Low Trust Tab */}
        <TabsContent value="trust">
          <Card>
            <CardHeader>
              <CardTitle className="text-yellow-600">Low-Trust Winning Offers</CardTitle>
            </CardHeader>
            <CardContent>
              {lowTrustOffers.length === 0 ? (
                <p className="text-gray-500">No low-trust offers in winning positions</p>
              ) : (
                <div className="space-y-3">
                  {lowTrustOffers.map(offer => (
                    <div key={offer.offer_id} className="p-3 border border-yellow-200 rounded bg-yellow-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">
                              Offer: {offer.offer_id.slice(0, 8)}...
                            </span>
                            <BandBadge band={offer.trust_band} type="trust" />
                          </div>
                          <p className="text-xs text-gray-600">
                            Supplier: {offer.supplier_id.slice(0, 8)}... | 
                            Product: {offer.product_id.slice(0, 8)}...
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-yellow-700">
                            {(offer.trust_score * 100).toFixed(0)}%
                          </div>
                          <div className="text-xs text-gray-500">trust score</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Opportunities Tab */}
        <TabsContent value="opportunities">
          <Card>
            <CardHeader>
              <CardTitle className="text-green-600">Margin Opportunities</CardTitle>
            </CardHeader>
            <CardContent>
              {opportunities.length === 0 ? (
                <p className="text-gray-500">No margin opportunities detected</p>
              ) : (
                <div className="space-y-3">
                  {opportunities.map(opp => (
                    <div key={opp.product_id} className="p-3 border rounded">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {opp.product_id.slice(0, 8)}...
                          </span>
                          <BandBadge band={opp.opportunity_band} type="opportunity" />
                          {opp.requires_review && (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                              Review Required
                            </Badge>
                          )}
                        </div>
                        {opp.estimated_savings_percent && (
                          <span className="text-lg font-bold text-green-600">
                            {opp.estimated_savings_percent.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{opp.reasoning}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Market spread: {opp.market_spread.toFixed(1)}%
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
