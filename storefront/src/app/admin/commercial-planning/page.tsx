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

interface SupplierForecast {
  supplier_id: string;
  forecast_type: string;
  forecast_score: number;
  forecast_band: string;
  predicted_direction: string;
  predicted_impact: string;
  reasoning: string;
  sample_size: number;
  confidence: number;
}

interface VolatilityForecast {
  product_id: string;
  volatility_score: number;
  volatility_band: string;
  predicted_direction: string;
  predicted_risk: string;
  reasoning: string;
  sample_size: number;
  confidence: number;
}

interface CommercialGuidance {
  id: string;
  guidance_type: string;
  entity_type: string;
  entity_id: string;
  guidance_band: string;
  title: string;
  summary: string;
  reasoning: string;
  recommended_action: string;
  priority_score: number;
  confidence: number;
  status: string;
  age_days?: number;
}

interface RiskScore {
  entity_type: string;
  entity_id: string;
  risk_score: number;
  risk_band: string;
  coverage_score: number;
  volatility_score: number;
  trust_score: number;
  freshness_score: number;
  reasoning: string;
  sample_size: number;
  confidence: number;
  data_quality: string;
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
  color?: 'default' | 'green' | 'yellow' | 'red' | 'blue' | 'purple';
}) {
  const colorClasses = {
    default: 'bg-gray-100 text-gray-900',
    green: 'bg-green-100 text-green-900',
    yellow: 'bg-yellow-100 text-yellow-900',
    red: 'bg-red-100 text-red-900',
    blue: 'bg-blue-100 text-blue-900',
    purple: 'bg-purple-100 text-purple-900',
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

function ForecastBandBadge({ band }: { band: string }) {
  const colors: Record<string, string> = {
    high_risk: 'bg-red-600 text-white',
    watch: 'bg-yellow-500 text-black',
    stable: 'bg-green-600 text-white',
    improving: 'bg-blue-500 text-white',
    high_volatility: 'bg-red-600 text-white',
    elevated: 'bg-orange-500 text-white',
    low_signal: 'bg-gray-400 text-white',
  };
  
  return (
    <Badge className={colors[band] || 'bg-gray-400 text-white'}>
      {band.replace('_', ' ')}
    </Badge>
  );
}

function GuidanceBandBadge({ band }: { band: string }) {
  const colors: Record<string, string> = {
    urgent: 'bg-red-600 text-white',
    high: 'bg-orange-500 text-white',
    moderate: 'bg-yellow-500 text-black',
    low: 'bg-gray-400 text-white',
  };
  
  return (
    <Badge className={colors[band] || 'bg-gray-400 text-white'}>
      {band}
    </Badge>
  );
}

function RiskBandBadge({ band }: { band: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-600 text-white',
    high: 'bg-orange-500 text-white',
    moderate: 'bg-yellow-500 text-black',
    low: 'bg-green-600 text-white',
  };
  
  return (
    <Badge className={colors[band] || 'bg-gray-400 text-white'}>
      {band}
    </Badge>
  );
}

function DirectionIndicator({ direction }: { direction: string }) {
  const icons: Record<string, { symbol: string; color: string }> = {
    deteriorating: { symbol: '↓', color: 'text-red-600' },
    increasing: { symbol: '↑', color: 'text-red-600' },
    stable: { symbol: '→', color: 'text-gray-600' },
    improving: { symbol: '↑', color: 'text-green-600' },
    decreasing: { symbol: '↓', color: 'text-green-600' },
    insufficient_signal: { symbol: '?', color: 'text-gray-400' },
  };
  
  const config = icons[direction] || icons.stable;
  
  return (
    <span className={`text-lg font-bold ${config.color}`}>
      {config.symbol}
    </span>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const color = confidence >= 0.7 ? 'bg-green-500' : confidence >= 0.5 ? 'bg-yellow-500' : 'bg-red-500';
  
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color}`} 
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs text-gray-500">{percent}%</span>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function CommercialPlanningPage() {
  const [loading, setLoading] = useState(true);
  const [supplierForecasts, setSupplierForecasts] = useState<SupplierForecast[]>([]);
  const [volatilityForecasts, setVolatilityForecasts] = useState<VolatilityForecast[]>([]);
  const [guidance, setGuidance] = useState<CommercialGuidance[]>([]);
  const [riskScores, setRiskScores] = useState<RiskScore[]>([]);
  const [weakCoverage, setWeakCoverage] = useState<RiskScore[]>([]);

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
      // Load suppliers likely to deteriorate
      const { data: supplierData } = await supabase
        .from('suppliers_likely_to_deteriorate')
        .select('*')
        .limit(20);
      
      if (supplierData) {
        setSupplierForecasts(supplierData as SupplierForecast[]);
      }
      
      // Load products with rising volatility
      const { data: volatilityData } = await supabase
        .from('products_rising_volatility')
        .select('*')
        .limit(20);
      
      if (volatilityData) {
        setVolatilityForecasts(volatilityData as VolatilityForecast[]);
      }
      
      // Load urgent guidance
      const { data: guidanceData } = await supabase
        .from('urgent_commercial_guidance')
        .select('*')
        .limit(30);
      
      if (guidanceData) {
        setGuidance(guidanceData as CommercialGuidance[]);
      }
      
      // Load risk leaderboard
      const { data: riskData } = await supabase
        .from('commercial_risk_leaderboard')
        .select('*')
        .limit(20);
      
      if (riskData) {
        setRiskScores(riskData as RiskScore[]);
      }
      
      // Load weakly covered products
      const { data: coverageData } = await supabase
        .from('weakly_covered_products')
        .select('*')
        .limit(15);
      
      if (coverageData) {
        setWeakCoverage(coverageData as RiskScore[]);
      }
      
    } catch (error) {
      console.error('Failed to load planning data:', error);
    } finally {
      setLoading(false);
    }
  }
  
  async function handleActionGuidance(guidanceId: string) {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase
      .from('commercial_guidance_recommendations')
      .update({ 
        status: 'actioned', 
        actioned_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
      })
      .eq('id', guidanceId);
    
    setGuidance(guidance.filter(g => g.id !== guidanceId));
  }
  
  async function handleDismissGuidance(guidanceId: string) {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase
      .from('commercial_guidance_recommendations')
      .update({ 
        status: 'dismissed',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', guidanceId);
    
    setGuidance(guidance.filter(g => g.id !== guidanceId));
  }
  
  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Commercial Planning</h1>
        <p>Loading forecasts and guidance...</p>
      </div>
    );
  }
  
  const urgentGuidance = guidance.filter(g => g.guidance_band === 'urgent');
  const highRisk = riskScores.filter(r => r.risk_band === 'critical' || r.risk_band === 'high');
  
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Commercial Planning</h1>
        <p className="text-gray-600 mt-1">Forward-looking forecasts and guidance</p>
        <p className="text-xs text-amber-600 mt-2">
          Note: All items are predictive guidance, not confirmed facts
        </p>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <StatCard
          title="Suppliers at Risk"
          value={supplierForecasts.length}
          subtitle="Showing deterioration signals"
          color={supplierForecasts.length > 5 ? 'red' : supplierForecasts.length > 0 ? 'yellow' : 'green'}
        />
        <StatCard
          title="Volatile Products"
          value={volatilityForecasts.length}
          subtitle="Rising price volatility"
          color={volatilityForecasts.length > 10 ? 'red' : volatilityForecasts.length > 0 ? 'yellow' : 'green'}
        />
        <StatCard
          title="Urgent Actions"
          value={urgentGuidance.length}
          subtitle="Rebid/re-source needed"
          color={urgentGuidance.length > 0 ? 'red' : 'green'}
        />
        <StatCard
          title="High Risk Products"
          value={highRisk.length}
          subtitle="Critical or high risk"
          color={highRisk.length > 5 ? 'red' : highRisk.length > 0 ? 'yellow' : 'green'}
        />
        <StatCard
          title="Weak Coverage"
          value={weakCoverage.length}
          subtitle="Few trusted suppliers"
          color={weakCoverage.length > 10 ? 'yellow' : 'green'}
        />
      </div>
      
      {/* Tabs */}
      <Tabs defaultValue="guidance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="guidance">Guidance ({guidance.length})</TabsTrigger>
          <TabsTrigger value="suppliers">Supplier Forecasts ({supplierForecasts.length})</TabsTrigger>
          <TabsTrigger value="volatility">Volatility ({volatilityForecasts.length})</TabsTrigger>
          <TabsTrigger value="risk">Risk Scores ({riskScores.length})</TabsTrigger>
          <TabsTrigger value="coverage">Weak Coverage ({weakCoverage.length})</TabsTrigger>
        </TabsList>
        
        {/* Guidance Tab */}
        <TabsContent value="guidance">
          <Card>
            <CardHeader>
              <CardTitle>Commercial Guidance Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              {guidance.length === 0 ? (
                <p className="text-gray-500">No active guidance recommendations</p>
              ) : (
                <div className="space-y-4">
                  {guidance.map(g => (
                    <div key={g.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <GuidanceBandBadge band={g.guidance_band} />
                            <Badge variant="outline">{g.guidance_type.replace('_', ' ')}</Badge>
                            <span className="text-xs text-gray-500">
                              {g.entity_type}: {g.entity_id.slice(0, 8)}...
                            </span>
                          </div>
                          <h3 className="font-semibold">{g.title}</h3>
                          <p className="text-sm text-gray-600 mt-1">{g.summary}</p>
                          <p className="text-sm text-blue-600 mt-2">
                            <strong>Action:</strong> {g.recommended_action}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span>Confidence: <ConfidenceBar confidence={g.confidence} /></span>
                            <span>Priority: {(g.priority_score * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleDismissGuidance(g.id)}
                          >
                            Dismiss
                          </Button>
                          <Button 
                            size="sm"
                            onClick={() => handleActionGuidance(g.id)}
                          >
                            Take Action
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
        
        {/* Supplier Forecasts Tab */}
        <TabsContent value="suppliers">
          <Card>
            <CardHeader>
              <CardTitle className="text-red-600">Suppliers Likely to Deteriorate</CardTitle>
            </CardHeader>
            <CardContent>
              {supplierForecasts.length === 0 ? (
                <p className="text-gray-500">No supplier deterioration forecasts</p>
              ) : (
                <div className="space-y-3">
                  {supplierForecasts.map((f, i) => (
                    <div key={`${f.supplier_id}-${f.forecast_type}-${i}`} className="p-3 border rounded">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <DirectionIndicator direction={f.predicted_direction} />
                          <span className="font-medium text-sm">
                            {f.supplier_id.slice(0, 8)}...
                          </span>
                          <ForecastBandBadge band={f.forecast_band} />
                          <Badge variant="outline">{f.forecast_type.replace('_', ' ')}</Badge>
                        </div>
                        <ConfidenceBar confidence={f.confidence} />
                      </div>
                      <p className="text-sm text-gray-600">{f.reasoning}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Sample size: {f.sample_size} | Impact: {f.predicted_impact}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Volatility Tab */}
        <TabsContent value="volatility">
          <Card>
            <CardHeader>
              <CardTitle className="text-orange-600">Products with Rising Price Volatility</CardTitle>
            </CardHeader>
            <CardContent>
              {volatilityForecasts.length === 0 ? (
                <p className="text-gray-500">No elevated volatility forecasts</p>
              ) : (
                <div className="space-y-3">
                  {volatilityForecasts.map((f, i) => (
                    <div key={`${f.product_id}-${i}`} className="p-3 border rounded">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <DirectionIndicator direction={f.predicted_direction} />
                          <span className="font-medium text-sm">
                            Product: {f.product_id.slice(0, 8)}...
                          </span>
                          <ForecastBandBadge band={f.volatility_band} />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">
                            {(f.volatility_score * 100).toFixed(0)}%
                          </span>
                          <ConfidenceBar confidence={f.confidence} />
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">{f.reasoning}</p>
                      <p className="text-sm text-amber-600 mt-1">{f.predicted_risk}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Risk Scores Tab */}
        <TabsContent value="risk">
          <Card>
            <CardHeader>
              <CardTitle>Commercial Risk Leaderboard</CardTitle>
            </CardHeader>
            <CardContent>
              {riskScores.length === 0 ? (
                <p className="text-gray-500">No risk scores available</p>
              ) : (
                <div className="space-y-3">
                  {riskScores.map((r, i) => (
                    <div key={`${r.entity_id}-${i}`} className="p-3 border rounded">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-gray-500">#{i + 1}</span>
                          <span className="font-medium text-sm">
                            {r.entity_type}: {r.entity_id.slice(0, 8)}...
                          </span>
                          <RiskBandBadge band={r.risk_band} />
                          <Badge variant="outline" className="text-xs">
                            {r.data_quality}
                          </Badge>
                        </div>
                        <span className="text-lg font-bold">
                          {(r.risk_score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-xs mb-2">
                        <div>
                          <span className="text-gray-500">Coverage:</span>
                          <span className="ml-1 font-medium">{(r.coverage_score * 100).toFixed(0)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Volatility:</span>
                          <span className="ml-1 font-medium">{(r.volatility_score * 100).toFixed(0)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Trust:</span>
                          <span className="ml-1 font-medium">{(r.trust_score * 100).toFixed(0)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Freshness:</span>
                          <span className="ml-1 font-medium">{(r.freshness_score * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">{r.reasoning}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Weak Coverage Tab */}
        <TabsContent value="coverage">
          <Card>
            <CardHeader>
              <CardTitle className="text-yellow-600">Products with Weak Supplier Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              {weakCoverage.length === 0 ? (
                <p className="text-gray-500">No weak coverage issues detected</p>
              ) : (
                <div className="space-y-3">
                  {weakCoverage.map((r, i) => (
                    <div key={`${r.entity_id}-${i}`} className="p-3 border border-yellow-200 rounded bg-yellow-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">
                          Product: {r.entity_id.slice(0, 8)}...
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            Coverage: <strong className="text-yellow-700">{(r.coverage_score * 100).toFixed(0)}%</strong>
                          </span>
                          <RiskBandBadge band={r.risk_band} />
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">{r.reasoning}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Trust: {(r.trust_score * 100).toFixed(0)}% | 
                        Depth: {((r as RiskScore & { depth_score: number }).depth_score * 100).toFixed(0)}%
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
