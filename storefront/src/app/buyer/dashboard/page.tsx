'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ============================================================================
// TYPES
// ============================================================================

interface DashboardSummary {
  savings: { realized: number; pipeline: number; ytd: number };
  risks: { critical: number; high: number; total: number };
  opportunities: { count: number; total_savings: number };
  spend: { total: number; avg_order: number };
}

interface SavingsSummary {
  quarter: { total: number; by_supplier_switch: number; by_better_offers: number; by_anomaly_detection: number; by_rebid: number };
  ytd: { total: number; by_supplier_switch: number; by_better_offers: number; by_anomaly_detection: number; by_rebid: number };
  pipeline: number;
  realized: number;
  trend: Array<{ month: string; savings: number }>;
}

interface MarketIntelligence {
  product_id: string;
  product_name: string;
  market_low: number;
  market_high: number;
  market_avg: number;
  trusted_best_price: number;
  trusted_best_supplier: string;
  suspicious_low_count: number;
  volatility_band: string;
  price_distribution: Array<{
    supplier_id: string;
    supplier_name: string;
    price: number;
    trust_band: string;
    is_recommended: boolean;
  }>;
}

interface SupplierComparison {
  supplier_id: string;
  supplier_name: string;
  price: number;
  price_vs_market: number;
  trust_score: number;
  trust_band: string;
  reliability_score: number;
  reliability_band: string;
  offer_freshness_days: number;
  freshness_status: string;
  recommendation_rank: number;
  is_recommended: boolean;
  recommendation_reasons: string[];
}

interface ProcurementRisk {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  affected_products: number;
  affected_spend: number;
  recommended_action: string;
  entity_name?: string;
}

interface SpendAnalytics {
  total_spend: number;
  period_spend: number;
  by_facility: Array<{ facility: string; spend: number; percentage: number }>;
  by_product: Array<{ product_id: string; product_name: string; spend: number; percentage: number }>;
  by_supplier: Array<{ supplier_id: string; supplier_name: string; spend: number; percentage: number }>;
  trend: Array<{ period: string; spend: number }>;
  avg_order_value: number;
  order_count: number;
}

interface SavingsOpportunity {
  id: string;
  type: string;
  priority: string;
  product_id: string;
  product_name: string;
  current_supplier: string;
  current_price: number;
  recommended_supplier?: string;
  recommended_price?: number;
  estimated_savings: number;
  savings_percentage: number;
  confidence: number;
  reasoning: string[];
}

interface AIExplanation {
  product_name: string;
  recommended_supplier: string;
  trust_reasoning: string[];
  price_reasoning: string[];
  risk_indicators: string[];
  confidence_factors: string[];
  alternative_options: Array<{ supplier: string; trade_offs: string[] }>;
}

// ============================================================================
// COMPONENTS
// ============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatPercentage(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-600 text-white',
    high: 'bg-orange-500 text-white',
    medium: 'bg-yellow-500 text-black',
    low: 'bg-gray-400 text-white',
  };
  return <Badge className={colors[severity] || 'bg-gray-400'}>{severity}</Badge>;
}

function TrustBadge({ band }: { band: string }) {
  const colors: Record<string, string> = {
    high_trust: 'bg-green-100 text-green-800',
    medium_trust: 'bg-blue-100 text-blue-800',
    review_sensitive: 'bg-yellow-100 text-yellow-800',
    low_trust: 'bg-red-100 text-red-800',
  };
  return <Badge className={colors[band] || 'bg-gray-100'}>{band.replace('_', ' ')}</Badge>;
}

function VolatilityBadge({ band }: { band: string }) {
  const colors: Record<string, string> = {
    stable: 'bg-green-100 text-green-800',
    elevated: 'bg-yellow-100 text-yellow-800',
    high_volatility: 'bg-red-100 text-red-800',
    low_signal: 'bg-gray-100 text-gray-800',
  };
  return <Badge className={colors[band] || 'bg-gray-100'}>{band.replace('_', ' ')}</Badge>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    high: 'bg-red-600 text-white',
    medium: 'bg-yellow-500 text-black',
    low: 'bg-gray-400 text-white',
  };
  return <Badge className={colors[priority] || 'bg-gray-400'}>{priority}</Badge>;
}

function MetricCard({ 
  title, 
  value, 
  subtitle,
  trend,
  color = 'default',
}: { 
  title: string; 
  value: string; 
  subtitle?: string;
  trend?: number;
  color?: 'default' | 'green' | 'blue' | 'yellow' | 'red';
}) {
  const colors = {
    default: 'bg-white',
    green: 'bg-green-50 border-green-200',
    blue: 'bg-blue-50 border-blue-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    red: 'bg-red-50 border-red-200',
  };
  
  return (
    <Card className={`${colors[color]} border`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">{value}</span>
          {trend !== undefined && (
            <span className={`text-sm ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function PriceDistributionChart({ distribution }: { distribution: MarketIntelligence['price_distribution'] }) {
  if (distribution.length === 0) return <p className="text-gray-500">No data available</p>;
  
  const maxPrice = Math.max(...distribution.map(d => d.price));
  
  return (
    <div className="space-y-2">
      {distribution.map((d, i) => (
        <div key={d.supplier_id} className="flex items-center gap-3">
          <div className="w-32 text-sm truncate" title={d.supplier_name}>
            {d.supplier_name}
            {d.is_recommended && <span className="ml-1 text-green-600">★</span>}
          </div>
          <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden relative">
            <div 
              className={`h-full ${
                d.trust_band === 'high_trust' ? 'bg-green-500' :
                d.trust_band === 'medium_trust' ? 'bg-blue-500' :
                d.trust_band === 'low_trust' ? 'bg-red-400' : 'bg-gray-400'
              }`}
              style={{ width: `${(d.price / maxPrice) * 100}%` }}
            />
          </div>
          <div className="w-20 text-sm text-right font-medium">
            {formatCurrency(d.price)}
          </div>
          <TrustBadge band={d.trust_band} />
        </div>
      ))}
    </div>
  );
}

function SavingsBreakdown({ data, title }: { data: SavingsSummary['quarter']; title: string }) {
  const items = [
    { label: 'Supplier Switches', value: data.by_supplier_switch, color: 'bg-green-500' },
    { label: 'Better Offers', value: data.by_better_offers, color: 'bg-blue-500' },
    { label: 'Anomaly Detection', value: data.by_anomaly_detection, color: 'bg-purple-500' },
    { label: 'Rebid Savings', value: data.by_rebid, color: 'bg-orange-500' },
  ].filter(i => i.value > 0);
  
  const total = data.total;
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">{title}</h4>
        <span className="text-2xl font-bold text-green-600">{formatCurrency(total)}</span>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${item.color}`} />
            <span className="flex-1 text-sm">{item.label}</span>
            <span className="font-medium">{formatCurrency(item.value)}</span>
            <span className="text-xs text-gray-500 w-12 text-right">
              {((item.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SpendChart({ data, type }: { data: Array<{ name: string; value: number; pct: number }>; type: string }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  
  return (
    <div className="space-y-3">
      {data.slice(0, 5).map((d, i) => (
        <div key={i} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="truncate max-w-[200px]">{d.name}</span>
            <span className="font-medium">{formatCurrency(d.value)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${d.pct}%` }}
            />
          </div>
        </div>
      ))}
      {data.length > 5 && (
        <p className="text-xs text-gray-500">+{data.length - 5} more</p>
      )}
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function BuyerDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [savings, setSavings] = useState<SavingsSummary | null>(null);
  const [marketIntel, setMarketIntel] = useState<MarketIntelligence[]>([]);
  const [risks, setRisks] = useState<ProcurementRisk[]>([]);
  const [spend, setSpend] = useState<SpendAnalytics | null>(null);
  const [opportunities, setOpportunities] = useState<SavingsOpportunity[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [supplierComparison, setSupplierComparison] = useState<SupplierComparison[]>([]);
  const [aiExplanation, setAiExplanation] = useState<AIExplanation | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  
  useEffect(() => {
    loadDashboardData();
  }, []);
  
  async function loadDashboardData() {
    setLoading(true);
    try {
      const [summaryRes, savingsRes, marketRes, risksRes, spendRes, oppsRes] = await Promise.all([
        fetch('/buyer/api/dashboard?endpoint=summary'),
        fetch('/buyer/api/dashboard?endpoint=savings'),
        fetch('/buyer/api/dashboard?endpoint=market-intelligence'),
        fetch('/buyer/api/dashboard?endpoint=risks'),
        fetch('/buyer/api/dashboard?endpoint=spend'),
        fetch('/buyer/api/dashboard?endpoint=opportunities'),
      ]);
      
      if (summaryRes.ok) setSummary((await summaryRes.json()).data);
      if (savingsRes.ok) setSavings((await savingsRes.json()).data);
      if (marketRes.ok) setMarketIntel((await marketRes.json()).data);
      if (risksRes.ok) setRisks((await risksRes.json()).data);
      if (spendRes.ok) setSpend((await spendRes.json()).data);
      if (oppsRes.ok) setOpportunities((await oppsRes.json()).data);
      
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  }
  
  async function loadSupplierComparison(productId: string) {
    setSelectedProduct(productId);
    const res = await fetch(`/buyer/api/dashboard?endpoint=supplier-comparison&product_id=${productId}`);
    if (res.ok) {
      setSupplierComparison((await res.json()).data);
    }
  }
  
  async function loadAIExplanation(productId: string) {
    const res = await fetch(`/buyer/api/dashboard?endpoint=ai-explanation&product_id=${productId}`);
    if (res.ok) {
      setAiExplanation((await res.json()).data);
      setShowExplanation(true);
    }
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
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Procurement Intelligence</h1>
              <p className="text-sm text-gray-500">Your AI-powered procurement command center</p>
            </div>
            <div className="flex items-center gap-3">
              {summary && summary.risks.critical > 0 && (
                <Badge className="bg-red-600 text-white px-3 py-1">
                  {summary.risks.critical} Critical Alerts
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>
      
      {/* Key Metrics Bar */}
      {summary && (
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                title="Realized Savings YTD"
                value={formatCurrency(summary.savings.ytd)}
                color="green"
              />
              <MetricCard
                title="Pipeline Savings"
                value={formatCurrency(summary.savings.pipeline)}
                subtitle={`${summary.opportunities.count} opportunities`}
                color="blue"
              />
              <MetricCard
                title="Total Spend"
                value={formatCurrency(summary.spend.total)}
                subtitle={`Avg order: ${formatCurrency(summary.spend.avg_order)}`}
              />
              <MetricCard
                title="Procurement Risks"
                value={summary.risks.total.toString()}
                subtitle={`${summary.risks.critical} critical, ${summary.risks.high} high`}
                color={summary.risks.critical > 0 ? 'red' : summary.risks.high > 0 ? 'yellow' : 'default'}
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Tabs defaultValue="savings" className="space-y-6">
          <div className="-mx-4 min-w-0 overflow-x-auto overflow-y-visible px-4 pb-1 sm:mx-0 sm:px-0 overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            <TabsList className="inline-flex h-auto min-h-11 w-max max-w-none flex-nowrap justify-start gap-1 rounded-md border bg-white p-1">
              <TabsTrigger className="min-h-11 shrink-0 px-3" value="savings">
                Savings
              </TabsTrigger>
              <TabsTrigger className="min-h-11 shrink-0 px-3" value="market">
                Market Intelligence
              </TabsTrigger>
              <TabsTrigger className="min-h-11 shrink-0 px-3" value="suppliers">
                Supplier Trust
              </TabsTrigger>
              <TabsTrigger className="min-h-11 shrink-0 px-3" value="risks">
                Procurement Risk
              </TabsTrigger>
              <TabsTrigger className="min-h-11 shrink-0 px-3" value="spend">
                Spend Analytics
              </TabsTrigger>
              <TabsTrigger className="min-h-11 shrink-0 px-3" value="opportunities">
                Opportunities
              </TabsTrigger>
            </TabsList>
          </div>
          
          {/* ============================================================ */}
          {/* SAVINGS TAB */}
          {/* ============================================================ */}
          <TabsContent value="savings" className="space-y-6">
            {savings && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>This Quarter</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <SavingsBreakdown data={savings.quarter} title="Savings Breakdown" />
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Year to Date</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <SavingsBreakdown data={savings.ytd} title="Savings Breakdown" />
                    </CardContent>
                  </Card>
                </div>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Savings Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-48 flex items-end gap-2">
                      {savings.trend.map((t, i) => {
                        const maxSavings = Math.max(...savings.trend.map(x => x.savings), 1);
                        const height = (t.savings / maxSavings) * 100;
                        
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center">
                            <div 
                              className="w-full bg-green-500 rounded-t"
                              style={{ height: `${Math.max(4, height)}%` }}
                            />
                            <span className="text-xs text-gray-500 mt-2">{t.month}</span>
                            <span className="text-xs font-medium">{formatCurrency(t.savings)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="bg-green-50 border-green-200">
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm text-green-800 mb-2">Realized Savings</p>
                      <p className="text-4xl font-bold text-green-600">{formatCurrency(savings.realized)}</p>
                      <p className="text-xs text-green-700 mt-2">Confirmed savings from accepted recommendations</p>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm text-blue-800 mb-2">Pipeline Savings</p>
                      <p className="text-4xl font-bold text-blue-600">{formatCurrency(savings.pipeline)}</p>
                      <p className="text-xs text-blue-700 mt-2">Pending opportunities awaiting action</p>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>
          
          {/* ============================================================ */}
          {/* MARKET INTELLIGENCE TAB */}
          {/* ============================================================ */}
          <TabsContent value="market" className="space-y-6">
            {marketIntel.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-gray-500">No market intelligence data available</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {marketIntel.slice(0, 5).map(intel => (
                  <Card key={intel.product_id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle>{intel.product_name}</CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            <VolatilityBadge band={intel.volatility_band} />
                            {intel.suspicious_low_count > 0 && (
                              <Badge className="bg-red-100 text-red-800">
                                {intel.suspicious_low_count} suspicious offers
                              </Badge>
                            )}
                          </CardDescription>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            loadSupplierComparison(intel.product_id);
                            loadAIExplanation(intel.product_id);
                          }}
                        >
                          Compare Suppliers
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-4 mb-6">
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">Market Low</p>
                          <p className="text-lg font-bold">{formatCurrency(intel.market_low)}</p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">Market Avg</p>
                          <p className="text-lg font-bold">{formatCurrency(intel.market_avg)}</p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">Market High</p>
                          <p className="text-lg font-bold">{formatCurrency(intel.market_high)}</p>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                          <p className="text-xs text-green-700">Trusted Best</p>
                          <p className="text-lg font-bold text-green-600">{formatCurrency(intel.trusted_best_price)}</p>
                          <p className="text-xs text-green-600 truncate">{intel.trusted_best_supplier}</p>
                        </div>
                      </div>
                      
                      <h4 className="font-medium mb-3">Price Distribution by Supplier</h4>
                      <PriceDistributionChart distribution={intel.price_distribution} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          
          {/* ============================================================ */}
          {/* SUPPLIER TRUST TAB */}
          {/* ============================================================ */}
          <TabsContent value="suppliers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Supplier Comparison</CardTitle>
                <CardDescription>
                  {selectedProduct 
                    ? 'Comparing suppliers for selected product'
                    : 'Select a product from Market Intelligence to compare suppliers'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {supplierComparison.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-4">Select a product to view supplier comparison</p>
                    <Button variant="outline" onClick={() => document.querySelector('[value="market"]')?.dispatchEvent(new Event('click'))}>
                      Go to Market Intelligence
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="p-3 text-left">Supplier</th>
                          <th className="p-3 text-left">Price</th>
                          <th className="p-3 text-left">vs Market</th>
                          <th className="p-3 text-left">Trust</th>
                          <th className="p-3 text-left">Reliability</th>
                          <th className="p-3 text-left">Freshness</th>
                          <th className="p-3 text-left">Rank</th>
                        </tr>
                      </thead>
                      <tbody>
                        {supplierComparison.map(s => (
                          <tr 
                            key={s.supplier_id} 
                            className={`border-b ${s.is_recommended ? 'bg-green-50' : ''}`}
                          >
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {s.is_recommended && <span className="text-green-600">★</span>}
                                <span className="font-medium">{s.supplier_name}</span>
                              </div>
                            </td>
                            <td className="p-3 font-medium">{formatCurrency(s.price)}</td>
                            <td className="p-3">
                              <span className={s.price_vs_market < 0 ? 'text-green-600' : 'text-red-600'}>
                                {formatPercentage(s.price_vs_market)}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span>{(s.trust_score * 100).toFixed(0)}%</span>
                                <TrustBadge band={s.trust_band} />
                              </div>
                            </td>
                            <td className="p-3">{(s.reliability_score * 100).toFixed(0)}%</td>
                            <td className="p-3">
                              <Badge className={
                                s.freshness_status === 'fresh' ? 'bg-green-100 text-green-800' :
                                s.freshness_status === 'aging' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }>
                                {s.offer_freshness_days}d
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Badge className={
                                s.recommendation_rank === 1 ? 'bg-green-600 text-white' :
                                s.recommendation_rank <= 3 ? 'bg-blue-500 text-white' :
                                'bg-gray-400 text-white'
                              }>
                                #{s.recommendation_rank}
                              </Badge>
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
          
          {/* ============================================================ */}
          {/* PROCUREMENT RISK TAB */}
          {/* ============================================================ */}
          <TabsContent value="risks" className="space-y-6">
            {risks.length === 0 ? (
              <Card className="bg-green-50 border-green-200">
                <CardContent className="py-12 text-center">
                  <div className="text-4xl mb-4">✓</div>
                  <p className="text-xl font-medium text-green-700">No Active Risks</p>
                  <p className="text-sm text-green-600">Your procurement is looking healthy</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {risks.map(risk => (
                  <Card key={risk.id} className={
                    risk.severity === 'critical' ? 'border-red-300 bg-red-50' :
                    risk.severity === 'high' ? 'border-orange-300 bg-orange-50' : ''
                  }>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={risk.severity} />
                          <CardTitle className="text-lg">{risk.title}</CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 mb-4">{risk.description}</p>
                      
                      <div className="flex items-center gap-4 text-sm mb-4">
                        {risk.affected_products > 0 && (
                          <span className="text-gray-500">{risk.affected_products} products affected</span>
                        )}
                        {risk.affected_spend > 0 && (
                          <span className="text-gray-500">{formatCurrency(risk.affected_spend)} at risk</span>
                        )}
                      </div>
                      
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-sm text-blue-800">
                          <strong>Recommended Action:</strong> {risk.recommended_action}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          
          {/* ============================================================ */}
          {/* SPEND ANALYTICS TAB */}
          {/* ============================================================ */}
          <TabsContent value="spend" className="space-y-6">
            {spend && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <MetricCard
                    title="Total Spend"
                    value={formatCurrency(spend.total_spend)}
                    subtitle={`${spend.order_count} orders`}
                    color="blue"
                  />
                  <MetricCard
                    title="Avg Order Value"
                    value={formatCurrency(spend.avg_order_value)}
                  />
                  <MetricCard
                    title="Suppliers Used"
                    value={spend.by_supplier.length.toString()}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Spend by Facility</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <SpendChart 
                        data={spend.by_facility.map(f => ({ 
                          name: f.facility, 
                          value: f.spend, 
                          pct: f.percentage 
                        }))} 
                        type="facility" 
                      />
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Spend by Product</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <SpendChart 
                        data={spend.by_product.map(p => ({ 
                          name: p.product_name, 
                          value: p.spend, 
                          pct: p.percentage 
                        }))} 
                        type="product" 
                      />
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Spend by Supplier</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <SpendChart 
                        data={spend.by_supplier.map(s => ({ 
                          name: s.supplier_name, 
                          value: s.spend, 
                          pct: s.percentage 
                        }))} 
                        type="supplier" 
                      />
                    </CardContent>
                  </Card>
                </div>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Spend Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-48 flex items-end gap-2">
                      {spend.trend.map((t, i) => {
                        const maxSpend = Math.max(...spend.trend.map(x => x.spend), 1);
                        const height = (t.spend / maxSpend) * 100;
                        
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center">
                            <div 
                              className="w-full bg-blue-500 rounded-t"
                              style={{ height: `${Math.max(4, height)}%` }}
                            />
                            <span className="text-xs text-gray-500 mt-2 truncate w-full text-center">{t.period}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
          
          {/* ============================================================ */}
          {/* OPPORTUNITIES TAB */}
          {/* ============================================================ */}
          <TabsContent value="opportunities" className="space-y-6">
            {opportunities.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-gray-500">No savings opportunities available at this time</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {opportunities.map(opp => (
                  <Card key={opp.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <PriorityBadge priority={opp.priority} />
                            <Badge variant="outline">{opp.type.replace('_', ' ')}</Badge>
                          </div>
                          <CardTitle className="text-lg">{opp.product_name}</CardTitle>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-green-600">{formatCurrency(opp.estimated_savings)}</p>
                          <p className="text-sm text-gray-500">{opp.savings_percentage.toFixed(1)}% savings</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">Current</p>
                          <p className="font-medium">{opp.current_supplier}</p>
                          {opp.current_price > 0 && (
                            <p className="text-sm text-gray-600">{formatCurrency(opp.current_price)}</p>
                          )}
                        </div>
                        {opp.recommended_supplier && (
                          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                            <p className="text-xs text-green-700">Recommended</p>
                            <p className="font-medium text-green-800">{opp.recommended_supplier}</p>
                            {opp.recommended_price && opp.recommended_price > 0 && (
                              <p className="text-sm text-green-600">{formatCurrency(opp.recommended_price)}</p>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {opp.reasoning.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-medium mb-2">Why this recommendation:</p>
                          <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                            {opp.reasoning.slice(0, 3).map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">Confidence:</span>
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${opp.confidence * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">{(opp.confidence * 100).toFixed(0)}%</span>
                        </div>
                        <Button 
                          size="sm"
                          onClick={() => loadAIExplanation(opp.product_id)}
                        >
                          View Details
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
      
      {/* AI Explanation Modal */}
      <Dialog open={showExplanation} onOpenChange={setShowExplanation}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>AI Recommendation Explanation</DialogTitle>
          </DialogHeader>
          {aiExplanation && (
            <div className="space-y-6">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm text-green-700 mb-1">Recommended Supplier</p>
                <p className="text-xl font-bold text-green-800">{aiExplanation.recommended_supplier}</p>
                <p className="text-sm text-green-600">for {aiExplanation.product_name}</p>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Trust Score Reasoning</h4>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  {aiExplanation.trust_reasoning.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Price Analysis</h4>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  {aiExplanation.price_reasoning.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
              
              {aiExplanation.risk_indicators.length > 0 && (
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <h4 className="font-medium mb-2 text-yellow-800">Risk Indicators</h4>
                  <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                    {aiExplanation.risk_indicators.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {aiExplanation.alternative_options.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Alternative Options</h4>
                  <div className="space-y-2">
                    {aiExplanation.alternative_options.map((alt, i) => (
                      <div key={i} className="p-3 bg-gray-50 rounded-lg">
                        <p className="font-medium">{alt.supplier}</p>
                        <p className="text-sm text-gray-500">
                          Trade-offs: {alt.trade_offs.join(', ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
