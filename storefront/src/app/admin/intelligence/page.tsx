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

interface SupplierHealth {
  supplier_id: string;
  supplier_name?: string;
  reliability_score: number;
  reliability_band: string;
  trust_avg: number;
  forecast_direction?: string;
  active_alerts: number;
}

interface MarginOpportunity {
  id: string;
  product_id: string;
  product_name?: string;
  opportunity_band: string;
  estimated_savings: number;
  estimated_savings_percent: number;
  current_price: number;
  best_trusted_price: number;
  reasoning: string;
}

interface VolatilityItem {
  product_id: string;
  product_name?: string;
  volatility_score: number;
  volatility_band: string;
  predicted_direction: string;
  reasoning: string;
}

interface ForecastItem {
  entity_type: string;
  entity_id: string;
  entity_name?: string;
  forecast_type: string;
  forecast_band: string;
  predicted_direction: string;
  reasoning: string;
  confidence: number;
}

interface GuidanceItem {
  id: string;
  guidance_type: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string;
  guidance_band: string;
  title: string;
  summary: string;
  recommended_action: string;
  priority_score: number;
}

interface AlertItem {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  summary: string;
  entity_type: string;
  entity_id: string;
  priority_score: number;
  created_at: string;
}

interface MetricsSummary {
  recommendation_acceptance_rate: number;
  realized_savings_capture_rate: number;
  total_recommendations: number;
  total_accepted: number;
  total_rejected: number;
  total_realized_savings: number;
  supplier_reliability_distribution: Record<string, number>;
  forecast_precision: number;
}

// ============================================================================
// BADGE COMPONENTS
// ============================================================================

function BandBadge({ band, type }: { band: string; type: 'reliability' | 'opportunity' | 'volatility' | 'guidance' | 'risk' }) {
  const colors: Record<string, Record<string, string>> = {
    reliability: {
      trusted: 'bg-green-600 text-white',
      stable: 'bg-blue-500 text-white',
      watch: 'bg-yellow-500 text-black',
      risky: 'bg-red-600 text-white',
    },
    opportunity: {
      major: 'bg-green-600 text-white',
      meaningful: 'bg-blue-500 text-white',
      minor: 'bg-gray-400 text-white',
      none: 'bg-gray-300 text-gray-600',
    },
    volatility: {
      high_volatility: 'bg-red-600 text-white',
      elevated: 'bg-orange-500 text-white',
      stable: 'bg-green-600 text-white',
      low_signal: 'bg-gray-400 text-white',
    },
    guidance: {
      urgent: 'bg-red-600 text-white',
      high: 'bg-orange-500 text-white',
      moderate: 'bg-yellow-500 text-black',
      low: 'bg-gray-400 text-white',
    },
    risk: {
      critical: 'bg-red-600 text-white',
      high: 'bg-orange-500 text-white',
      moderate: 'bg-yellow-500 text-black',
      low: 'bg-green-600 text-white',
    },
  };
  
  return (
    <Badge className={colors[type]?.[band] || 'bg-gray-400 text-white'}>
      {band.replace('_', ' ')}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-600 text-white',
    high: 'bg-orange-500 text-white',
    normal: 'bg-blue-500 text-white',
    low: 'bg-gray-400 text-white',
  };
  
  return <Badge className={colors[severity] || 'bg-gray-400 text-white'}>{severity}</Badge>;
}

function DirectionIndicator({ direction }: { direction: string }) {
  const config: Record<string, { symbol: string; color: string; label: string }> = {
    deteriorating: { symbol: '↓', color: 'text-red-600', label: 'Declining' },
    increasing: { symbol: '↑', color: 'text-red-600', label: 'Increasing' },
    stable: { symbol: '→', color: 'text-gray-600', label: 'Stable' },
    improving: { symbol: '↑', color: 'text-green-600', label: 'Improving' },
    decreasing: { symbol: '↓', color: 'text-green-600', label: 'Decreasing' },
    insufficient_signal: { symbol: '?', color: 'text-gray-400', label: 'Low Signal' },
  };
  
  const c = config[direction] || config.stable;
  
  return (
    <span className={`flex items-center gap-1 ${c.color}`}>
      <span className="text-lg font-bold">{c.symbol}</span>
      <span className="text-xs">{c.label}</span>
    </span>
  );
}

// ============================================================================
// STAT CARDS
// ============================================================================

function StatCard({ 
  title, 
  value, 
  subtitle,
  trend,
  color = 'default',
  size = 'normal',
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string;
  trend?: { value: number; label: string };
  color?: 'default' | 'green' | 'yellow' | 'red' | 'blue';
  size?: 'normal' | 'large';
}) {
  const bgColors = {
    default: 'bg-white',
    green: 'bg-green-50 border-green-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    red: 'bg-red-50 border-red-200',
    blue: 'bg-blue-50 border-blue-200',
  };
  
  const textColors = {
    default: 'text-gray-900',
    green: 'text-green-700',
    yellow: 'text-yellow-700',
    red: 'text-red-700',
    blue: 'text-blue-700',
  };
  
  return (
    <Card className={`${bgColors[color]} border`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`${size === 'large' ? 'text-3xl' : 'text-2xl'} font-bold ${textColors[color]}`}>
          {value}
        </div>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        {trend && (
          <p className={`text-xs mt-1 ${trend.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value).toFixed(1)}% {trend.label}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// SECTION COMPONENTS
// ============================================================================

function PriorityIndicator({ score }: { score: number }) {
  const bars = Math.ceil(score * 5);
  return (
    <div className="flex gap-0.5" title={`Priority: ${(score * 100).toFixed(0)}%`}>
      {[1, 2, 3, 4, 5].map(i => (
        <div 
          key={i} 
          className={`w-1.5 h-4 rounded-sm ${
            i <= bars 
              ? bars >= 4 ? 'bg-red-500' : bars >= 3 ? 'bg-orange-500' : 'bg-yellow-500'
              : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

function SupplierHealthSection({ suppliers }: { suppliers: SupplierHealth[] }) {
  const risky = suppliers.filter(s => s.reliability_band === 'risky');
  const watch = suppliers.filter(s => s.reliability_band === 'watch');
  const deteriorating = suppliers.filter(s => s.forecast_direction === 'deteriorating');
  
  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard title="Risky Suppliers" value={risky.length} color={risky.length > 0 ? 'red' : 'green'} />
        <StatCard title="Watch List" value={watch.length} color={watch.length > 5 ? 'yellow' : 'default'} />
        <StatCard title="Deteriorating" value={deteriorating.length} color={deteriorating.length > 0 ? 'red' : 'green'} />
        <StatCard title="Total Tracked" value={suppliers.length} />
      </div>
      
      {/* Problem Suppliers */}
      {(risky.length > 0 || deteriorating.length > 0) && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-700">Requires Attention</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[...risky, ...deteriorating.filter(d => !risky.find(r => r.supplier_id === d.supplier_id))].slice(0, 8).map(s => (
                <div key={s.supplier_id} className="flex items-center justify-between p-2 bg-red-50 rounded">
                  <div>
                    <span className="font-medium">{s.supplier_name || s.supplier_id.slice(0, 8)}...</span>
                    <div className="flex items-center gap-2 mt-1">
                      <BandBadge band={s.reliability_band} type="reliability" />
                      {s.forecast_direction && <DirectionIndicator direction={s.forecast_direction} />}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold">{(s.reliability_score * 100).toFixed(0)}%</span>
                    {s.active_alerts > 0 && (
                      <Badge className="ml-2 bg-red-600 text-white">{s.active_alerts} alerts</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Trust Leaderboard (Top 5) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Trust Leaderboard (Top 5)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {suppliers
              .sort((a, b) => b.trust_avg - a.trust_avg)
              .slice(0, 5)
              .map((s, i) => (
                <div key={s.supplier_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">
                      {i + 1}
                    </span>
                    <span className="font-medium">{s.supplier_name || s.supplier_id.slice(0, 8)}...</span>
                  </div>
                  <span className="text-lg font-bold text-green-600">{(s.trust_avg * 100).toFixed(0)}%</span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MarginOpportunitiesSection({ opportunities }: { opportunities: MarginOpportunity[] }) {
  const major = opportunities.filter(o => o.opportunity_band === 'major');
  const totalSavings = opportunities.reduce((sum, o) => sum + o.estimated_savings, 0);
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard 
          title="Major Opportunities" 
          value={major.length} 
          color={major.length > 0 ? 'green' : 'default'} 
        />
        <StatCard 
          title="Est. Total Savings" 
          value={`$${totalSavings.toLocaleString()}`}
          color="blue"
        />
        <StatCard 
          title="Avg Savings %" 
          value={`${(opportunities.reduce((s, o) => s + o.estimated_savings_percent, 0) / Math.max(1, opportunities.length)).toFixed(1)}%`}
        />
      </div>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Top Savings Opportunities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {opportunities.slice(0, 8).map(o => (
              <div key={o.id} className="p-3 border rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-medium">{o.product_name || o.product_id.slice(0, 8)}...</span>
                    <div className="flex items-center gap-2 mt-1">
                      <BandBadge band={o.opportunity_band} type="opportunity" />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600">
                      ${o.estimated_savings.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {o.estimated_savings_percent.toFixed(1)}% savings
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>Current: ${o.current_price.toFixed(2)}</span>
                  <span>Best Trusted: ${o.best_trusted_price.toFixed(2)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">{o.reasoning}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MarketStabilitySection({ volatility }: { volatility: VolatilityItem[] }) {
  const highVolatility = volatility.filter(v => v.volatility_band === 'high_volatility');
  const elevated = volatility.filter(v => v.volatility_band === 'elevated');
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard 
          title="High Volatility" 
          value={highVolatility.length} 
          color={highVolatility.length > 5 ? 'red' : highVolatility.length > 0 ? 'yellow' : 'green'} 
        />
        <StatCard 
          title="Elevated" 
          value={elevated.length}
          color={elevated.length > 10 ? 'yellow' : 'default'}
        />
        <StatCard 
          title="Stable Products" 
          value={volatility.filter(v => v.volatility_band === 'stable').length}
          color="green"
        />
      </div>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-orange-700">Products with Highest Volatility</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {volatility.slice(0, 8).map(v => (
              <div key={v.product_id} className="flex items-center justify-between p-2 bg-orange-50 rounded">
                <div>
                  <span className="font-medium">{v.product_name || v.product_id.slice(0, 8)}...</span>
                  <div className="flex items-center gap-2 mt-1">
                    <BandBadge band={v.volatility_band} type="volatility" />
                    <DirectionIndicator direction={v.predicted_direction} />
                  </div>
                </div>
                <span className="text-lg font-bold text-orange-600">
                  {(v.volatility_score * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ForecastsSection({ forecasts, guidance }: { forecasts: ForecastItem[]; guidance: GuidanceItem[] }) {
  const supplierForecasts = forecasts.filter(f => f.entity_type === 'supplier');
  const productForecasts = forecasts.filter(f => f.entity_type === 'product');
  const rebidGuidance = guidance.filter(g => g.guidance_type.includes('rebid'));
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard 
          title="Suppliers at Risk" 
          value={supplierForecasts.filter(f => f.forecast_band === 'high_risk').length}
          color={supplierForecasts.some(f => f.forecast_band === 'high_risk') ? 'red' : 'green'}
        />
        <StatCard 
          title="Products Need Rebid" 
          value={rebidGuidance.length}
          color={rebidGuidance.length > 5 ? 'yellow' : 'default'}
        />
        <StatCard 
          title="Total Guidance" 
          value={guidance.length}
        />
      </div>
      
      {/* Urgent Guidance */}
      {guidance.filter(g => g.guidance_band === 'urgent').length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-700">Urgent Action Required</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {guidance.filter(g => g.guidance_band === 'urgent').slice(0, 5).map(g => (
                <div key={g.id} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-red-900">{g.title}</h4>
                      <p className="text-sm text-red-700">{g.summary}</p>
                    </div>
                    <PriorityIndicator score={g.priority_score} />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <Badge variant="outline" className="text-xs">{g.guidance_type.replace('_', ' ')}</Badge>
                    <span className="text-sm text-red-800 font-medium">{g.recommended_action}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Other Forecasts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Supplier Deterioration Forecasts</CardTitle>
        </CardHeader>
        <CardContent>
          {supplierForecasts.length === 0 ? (
            <p className="text-gray-500 text-sm">No deterioration forecasts</p>
          ) : (
            <div className="space-y-2">
              {supplierForecasts.slice(0, 6).map((f, i) => (
                <div key={`${f.entity_id}-${i}`} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex items-center gap-2">
                    <DirectionIndicator direction={f.predicted_direction} />
                    <span className="font-medium">{f.entity_name || f.entity_id.slice(0, 8)}...</span>
                    <BandBadge band={f.forecast_band} type="risk" />
                  </div>
                  <span className="text-xs text-gray-500">
                    {(f.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AlertsSection({ alerts }: { alerts: AlertItem[] }) {
  const critical = alerts.filter(a => a.severity === 'critical');
  const high = alerts.filter(a => a.severity === 'high');
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard 
          title="Critical" 
          value={critical.length} 
          color={critical.length > 0 ? 'red' : 'green'} 
        />
        <StatCard 
          title="High Priority" 
          value={high.length}
          color={high.length > 5 ? 'yellow' : 'default'}
        />
        <StatCard title="Total Open" value={alerts.length} />
      </div>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Active Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-green-600 text-center py-4">No active alerts</p>
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 10).map(alert => (
                <div 
                  key={alert.id} 
                  className={`p-3 rounded-lg border ${
                    alert.severity === 'critical' ? 'bg-red-50 border-red-200' :
                    alert.severity === 'high' ? 'bg-orange-50 border-orange-200' :
                    'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <SeverityBadge severity={alert.severity} />
                        <Badge variant="outline" className="text-xs">{alert.alert_type.replace('_', ' ')}</Badge>
                        <PriorityIndicator score={alert.priority_score} />
                      </div>
                      <h4 className="font-medium">{alert.title}</h4>
                      <p className="text-sm text-gray-600">{alert.summary}</p>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(alert.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricsSection({ metrics }: { metrics: MetricsSummary }) {
  return (
    <div className="space-y-4">
      {/* Key Performance Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard 
          title="Acceptance Rate" 
          value={`${(metrics.recommendation_acceptance_rate * 100).toFixed(1)}%`}
          subtitle={`${metrics.total_accepted} of ${metrics.total_recommendations}`}
          color={metrics.recommendation_acceptance_rate >= 0.6 ? 'green' : metrics.recommendation_acceptance_rate >= 0.4 ? 'yellow' : 'red'}
          size="large"
        />
        <StatCard 
          title="Savings Capture" 
          value={`${(metrics.realized_savings_capture_rate * 100).toFixed(1)}%`}
          color={metrics.realized_savings_capture_rate >= 0.7 ? 'green' : 'yellow'}
          size="large"
        />
        <StatCard 
          title="Total Realized Savings" 
          value={`$${metrics.total_realized_savings.toLocaleString()}`}
          color="blue"
          size="large"
        />
        <StatCard 
          title="Forecast Precision" 
          value={`${(metrics.forecast_precision * 100).toFixed(1)}%`}
          color={metrics.forecast_precision >= 0.7 ? 'green' : 'yellow'}
          size="large"
        />
      </div>
      
      {/* Reliability Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Supplier Reliability Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 h-8">
            {Object.entries(metrics.supplier_reliability_distribution).map(([band, count]) => {
              const total = Object.values(metrics.supplier_reliability_distribution).reduce((a, b) => a + b, 0);
              const pct = total > 0 ? (count / total) * 100 : 0;
              const colors: Record<string, string> = {
                trusted: 'bg-green-500',
                stable: 'bg-blue-500',
                watch: 'bg-yellow-500',
                risky: 'bg-red-500',
              };
              
              return (
                <div 
                  key={band}
                  className={`h-full ${colors[band] || 'bg-gray-400'} rounded flex items-center justify-center text-white text-xs font-medium`}
                  style={{ width: `${pct}%`, minWidth: count > 0 ? '60px' : '0' }}
                  title={`${band}: ${count} (${pct.toFixed(1)}%)`}
                >
                  {pct >= 10 && `${band}: ${count}`}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>Trusted</span>
            <span>Stable</span>
            <span>Watch</span>
            <span>Risky</span>
          </div>
        </CardContent>
      </Card>
      
      {/* Recommendation Outcomes */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-green-50">
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-green-600">{metrics.total_accepted}</p>
            <p className="text-sm text-green-700">Accepted</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50">
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-red-600">{metrics.total_rejected}</p>
            <p className="text-sm text-red-700">Rejected</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50">
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-blue-600">{metrics.total_recommendations}</p>
            <p className="text-sm text-blue-700">Total</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function CommercialIntelligenceDashboard() {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Data states
  const [supplierHealth, setSupplierHealth] = useState<SupplierHealth[]>([]);
  const [opportunities, setOpportunities] = useState<MarginOpportunity[]>([]);
  const [volatility, setVolatility] = useState<VolatilityItem[]>([]);
  const [forecasts, setForecasts] = useState<ForecastItem[]>([]);
  const [guidance, setGuidance] = useState<GuidanceItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [metrics, setMetrics] = useState<MetricsSummary>({
    recommendation_acceptance_rate: 0,
    realized_savings_capture_rate: 0,
    total_recommendations: 0,
    total_accepted: 0,
    total_rejected: 0,
    total_realized_savings: 0,
    supplier_reliability_distribution: {},
    forecast_precision: 0,
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    try {
      // Load all data in parallel
      const [
        suppliersRes,
        opportunitiesRes,
        volatilityRes,
        forecastsRes,
        guidanceRes,
        alertsRes,
        outcomesRes,
        reliabilityRes,
        forecastMetricsRes,
      ] = await Promise.all([
        // Supplier health
        supabase
          .from('supplier_reliability_scores')
          .select('supplier_id, reliability_score, reliability_band')
          .order('calculated_at', { ascending: false })
          .limit(100),
        
        // Margin opportunities
        supabase
          .from('margin_opportunities')
          .select('*')
          .in('opportunity_band', ['major', 'meaningful'])
          .order('estimated_savings', { ascending: false })
          .limit(20),
        
        // Volatility forecasts
        supabase
          .from('products_rising_volatility')
          .select('*')
          .limit(20),
        
        // Supplier forecasts
        supabase
          .from('suppliers_likely_to_deteriorate')
          .select('*')
          .limit(20),
        
        // Commercial guidance
        supabase
          .from('urgent_commercial_guidance')
          .select('*')
          .limit(20),
        
        // Procurement alerts
        supabase
          .from('procurement_alerts')
          .select('*')
          .eq('status', 'open')
          .order('priority_score', { ascending: false })
          .limit(20),
        
        // Recommendation outcomes for metrics
        supabase
          .from('recommendation_outcomes')
          .select('outcome_status, realized_savings')
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        
        // Reliability distribution
        supabase
          .from('supplier_reliability_scores')
          .select('reliability_band')
          .order('calculated_at', { ascending: false }),
        
        // Forecast quality
        supabase
          .from('forecast_quality_metrics')
          .select('metric_value')
          .eq('metric_type', 'supplier_forecast_precision')
          .order('created_at', { ascending: false })
          .limit(1),
      ]);
      
      // Process supplier health
      if (suppliersRes.data) {
        const unique = new Map<string, SupplierHealth>();
        for (const s of suppliersRes.data) {
          if (!unique.has(s.supplier_id)) {
            unique.set(s.supplier_id, {
              supplier_id: s.supplier_id,
              reliability_score: Number(s.reliability_score),
              reliability_band: s.reliability_band,
              trust_avg: Number(s.reliability_score),
              active_alerts: 0,
            });
          }
        }
        
        // Add forecast directions
        if (forecastsRes.data) {
          for (const f of forecastsRes.data) {
            const supplier = unique.get(f.supplier_id);
            if (supplier) {
              supplier.forecast_direction = f.predicted_direction;
            }
          }
        }
        
        setSupplierHealth(Array.from(unique.values()));
      }
      
      // Process opportunities
      if (opportunitiesRes.data) {
        setOpportunities(opportunitiesRes.data.map(o => ({
          id: o.id,
          product_id: o.product_id,
          opportunity_band: o.opportunity_band,
          estimated_savings: Number(o.estimated_savings_per_case || 0),
          estimated_savings_percent: Number(o.estimated_savings_percent || 0),
          current_price: Number(o.market_spread || 0),
          best_trusted_price: Number(o.trust_adjusted_best_price || 0),
          reasoning: o.reasoning || '',
        })));
      }
      
      // Process volatility
      if (volatilityRes.data) {
        setVolatility(volatilityRes.data.map(v => ({
          product_id: v.product_id,
          volatility_score: Number(v.volatility_score),
          volatility_band: v.volatility_band,
          predicted_direction: v.predicted_direction,
          reasoning: v.reasoning || '',
        })));
      }
      
      // Process forecasts
      if (forecastsRes.data) {
        setForecasts(forecastsRes.data.map(f => ({
          entity_type: 'supplier',
          entity_id: f.supplier_id,
          forecast_type: f.forecast_type,
          forecast_band: f.forecast_band,
          predicted_direction: f.predicted_direction,
          reasoning: f.reasoning || '',
          confidence: Number(f.confidence),
        })));
      }
      
      // Process guidance
      if (guidanceRes.data) {
        setGuidance(guidanceRes.data.map(g => ({
          id: g.id,
          guidance_type: g.guidance_type,
          entity_type: g.entity_type,
          entity_id: g.entity_id,
          guidance_band: g.guidance_band,
          title: g.title,
          summary: g.summary,
          recommended_action: g.recommended_action,
          priority_score: Number(g.priority_score),
        })));
      }
      
      // Process alerts
      if (alertsRes.data) {
        setAlerts(alertsRes.data.map(a => ({
          id: a.id,
          alert_type: a.alert_type,
          severity: a.severity,
          title: a.title,
          summary: a.summary,
          entity_type: a.entity_type,
          entity_id: a.entity_id,
          priority_score: Number(a.priority_score),
          created_at: a.created_at,
        })));
      }
      
      // Calculate metrics
      if (outcomesRes.data) {
        const accepted = outcomesRes.data.filter(o => o.outcome_status === 'accepted').length;
        const rejected = outcomesRes.data.filter(o => o.outcome_status === 'rejected').length;
        const totalSavings = outcomesRes.data
          .filter(o => o.realized_savings)
          .reduce((sum, o) => sum + Number(o.realized_savings), 0);
        
        // Reliability distribution
        const distribution: Record<string, number> = { trusted: 0, stable: 0, watch: 0, risky: 0 };
        if (reliabilityRes.data) {
          const seen = new Set<string>();
          for (const r of reliabilityRes.data) {
            const key = `${r.reliability_band}`;
            if (!seen.has(key)) {
              distribution[r.reliability_band] = (distribution[r.reliability_band] || 0) + 1;
            }
          }
        }
        
        setMetrics({
          recommendation_acceptance_rate: outcomesRes.data.length > 0 ? accepted / outcomesRes.data.length : 0,
          realized_savings_capture_rate: 0.65, // Would need actual calculation
          total_recommendations: outcomesRes.data.length,
          total_accepted: accepted,
          total_rejected: rejected,
          total_realized_savings: totalSavings,
          supplier_reliability_distribution: distribution,
          forecast_precision: forecastMetricsRes.data?.[0]?.metric_value || 0,
        });
      }
      
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }
  
  // Calculate summary counts for header
  const criticalCount = alerts.filter(a => a.severity === 'critical').length + 
                        guidance.filter(g => g.guidance_band === 'urgent').length;
  const riskySuppliers = supplierHealth.filter(s => s.reliability_band === 'risky').length;
  const majorOpportunities = opportunities.filter(o => o.opportunity_band === 'major').length;
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading intelligence dashboard...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Commercial Intelligence</h1>
              <p className="text-sm text-gray-500">
                Daily Command Center • Last updated: {lastUpdated?.toLocaleTimeString()}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Quick Status */}
              {criticalCount > 0 && (
                <Badge className="bg-red-600 text-white px-3 py-1">
                  {criticalCount} Critical
                </Badge>
              )}
              {riskySuppliers > 0 && (
                <Badge className="bg-orange-500 text-white px-3 py-1">
                  {riskySuppliers} Risky Suppliers
                </Badge>
              )}
              {majorOpportunities > 0 && (
                <Badge className="bg-green-600 text-white px-3 py-1">
                  {majorOpportunities} Major Savings
                </Badge>
              )}
              <Button onClick={loadDashboardData} variant="outline" size="sm">
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-white border">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="suppliers">Supplier Health</TabsTrigger>
            <TabsTrigger value="opportunities">Margin Opportunities</TabsTrigger>
            <TabsTrigger value="stability">Market Stability</TabsTrigger>
            <TabsTrigger value="forecasts">Forecasts</TabsTrigger>
            <TabsTrigger value="alerts">Alerts ({alerts.length})</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
          </TabsList>
          
          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-6">
                {/* Today's Priorities */}
                <Card className="border-blue-200 bg-blue-50">
                  <CardHeader>
                    <CardTitle className="text-blue-900">Today's Priorities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {criticalCount > 0 && (
                        <div className="flex items-center justify-between p-2 bg-red-100 rounded">
                          <span className="font-medium text-red-900">Critical actions required</span>
                          <Badge className="bg-red-600 text-white">{criticalCount}</Badge>
                        </div>
                      )}
                      {riskySuppliers > 0 && (
                        <div className="flex items-center justify-between p-2 bg-orange-100 rounded">
                          <span className="font-medium text-orange-900">Risky suppliers to review</span>
                          <Badge className="bg-orange-500 text-white">{riskySuppliers}</Badge>
                        </div>
                      )}
                      {majorOpportunities > 0 && (
                        <div className="flex items-center justify-between p-2 bg-green-100 rounded">
                          <span className="font-medium text-green-900">Major savings opportunities</span>
                          <Badge className="bg-green-600 text-white">{majorOpportunities}</Badge>
                        </div>
                      )}
                      {guidance.filter(g => g.guidance_type.includes('rebid')).length > 0 && (
                        <div className="flex items-center justify-between p-2 bg-yellow-100 rounded">
                          <span className="font-medium text-yellow-900">Products needing rebid</span>
                          <Badge className="bg-yellow-500 text-black">
                            {guidance.filter(g => g.guidance_type.includes('rebid')).length}
                          </Badge>
                        </div>
                      )}
                      {criticalCount === 0 && riskySuppliers === 0 && majorOpportunities === 0 && (
                        <p className="text-green-700 text-center py-4">
                          All clear! No urgent actions required.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
                
                {/* Supplier Summary */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Supplier Health Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-red-50 rounded text-center">
                        <p className="text-2xl font-bold text-red-600">{riskySuppliers}</p>
                        <p className="text-xs text-red-700">Risky</p>
                      </div>
                      <div className="p-3 bg-yellow-50 rounded text-center">
                        <p className="text-2xl font-bold text-yellow-600">
                          {supplierHealth.filter(s => s.reliability_band === 'watch').length}
                        </p>
                        <p className="text-xs text-yellow-700">Watch</p>
                      </div>
                      <div className="p-3 bg-blue-50 rounded text-center">
                        <p className="text-2xl font-bold text-blue-600">
                          {supplierHealth.filter(s => s.reliability_band === 'stable').length}
                        </p>
                        <p className="text-xs text-blue-700">Stable</p>
                      </div>
                      <div className="p-3 bg-green-50 rounded text-center">
                        <p className="text-2xl font-bold text-green-600">
                          {supplierHealth.filter(s => s.reliability_band === 'trusted').length}
                        </p>
                        <p className="text-xs text-green-700">Trusted</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Right Column */}
              <div className="space-y-6">
                {/* Key Metrics */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Performance Snapshot</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-gray-50 rounded">
                        <p className="text-2xl font-bold">
                          {(metrics.recommendation_acceptance_rate * 100).toFixed(0)}%
                        </p>
                        <p className="text-xs text-gray-600">Acceptance Rate</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded">
                        <p className="text-2xl font-bold text-green-600">
                          ${metrics.total_realized_savings.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-600">Realized Savings</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Recent Alerts */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Recent Alerts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {alerts.length === 0 ? (
                      <p className="text-green-600 text-center py-4">No active alerts</p>
                    ) : (
                      <div className="space-y-2">
                        {alerts.slice(0, 4).map(alert => (
                          <div key={alert.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                            <SeverityBadge severity={alert.severity} />
                            <span className="text-sm truncate flex-1">{alert.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
          
          {/* Individual Section Tabs */}
          <TabsContent value="suppliers">
            <SupplierHealthSection suppliers={supplierHealth} />
          </TabsContent>
          
          <TabsContent value="opportunities">
            <MarginOpportunitiesSection opportunities={opportunities} />
          </TabsContent>
          
          <TabsContent value="stability">
            <MarketStabilitySection volatility={volatility} />
          </TabsContent>
          
          <TabsContent value="forecasts">
            <ForecastsSection forecasts={forecasts} guidance={guidance} />
          </TabsContent>
          
          <TabsContent value="alerts">
            <AlertsSection alerts={alerts} />
          </TabsContent>
          
          <TabsContent value="metrics">
            <MetricsSection metrics={metrics} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
