'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SupplierPortalSubNav } from '@/components/supplier-portal/SupplierPortalSubNav';

// ============================================================================
// TYPES
// ============================================================================

interface CompetitivenessInsight {
  product_id: string;
  product_name?: string;
  supplier_price: number;
  market_avg: number;
  market_min: number;
  price_percentile: number;
  recommendation_rank: number;
  recommendation_band: string;
  trust_score: number | null;
}

interface RankDistribution {
  rank: number;
  count: number;
  percentage: number;
}

// ============================================================================
// COMPONENTS
// ============================================================================

function RankBadge({ rank }: { rank: number }) {
  const colors: Record<number, string> = {
    1: 'bg-green-600 text-white',
    2: 'bg-blue-500 text-white',
    3: 'bg-yellow-500 text-black',
  };
  
  return (
    <Badge className={colors[rank] || 'bg-gray-400 text-white'}>
      #{rank}
    </Badge>
  );
}

function PricePositionBar({ percentile, yourPrice, avgPrice, minPrice }: {
  percentile: number;
  yourPrice: number;
  avgPrice: number;
  minPrice: number;
}) {
  const isCompetitive = percentile <= 30;
  const isExpensive = percentile >= 70;
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>Min: ${minPrice.toFixed(2)}</span>
        <span>Avg: ${avgPrice.toFixed(2)}</span>
      </div>
      <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className="absolute h-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-400"
          style={{ width: '100%' }}
        />
        <div 
          className="absolute top-0 h-full w-0.5 bg-black"
          style={{ left: `${Math.min(100, percentile)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs">
        <span className={isCompetitive ? 'text-green-600 font-medium' : isExpensive ? 'text-red-600 font-medium' : 'text-gray-600'}>
          Your price: ${yourPrice.toFixed(2)} ({percentile.toFixed(0)}%)
        </span>
      </div>
    </div>
  );
}

function RankDistributionChart({ distribution }: { distribution: RankDistribution[] }) {
  const maxCount = Math.max(...distribution.map(d => d.count), 1);
  
  return (
    <div className="space-y-2">
      {distribution.map(d => (
        <div key={d.rank} className="flex items-center gap-2">
          <span className="w-8 text-right font-medium">#{d.rank}</span>
          <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
            <div 
              className={`h-full ${
                d.rank === 1 ? 'bg-green-500' : 
                d.rank === 2 ? 'bg-blue-500' : 
                d.rank === 3 ? 'bg-yellow-500' : 'bg-gray-400'
              }`}
              style={{ width: `${(d.count / maxCount) * 100}%` }}
            />
          </div>
          <span className="w-16 text-sm text-gray-600">
            {d.count} ({d.percentage.toFixed(0)}%)
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function SupplierCompetitivenessPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<CompetitivenessInsight[]>([]);
  const [rankDistribution, setRankDistribution] = useState<RankDistribution[]>([]);
  
  useEffect(() => {
    loadData();
  }, []);
  
  async function loadData() {
    setLoading(true);
    try {
      const [insightsRes, distributionRes] = await Promise.all([
        fetch('/supplier-portal/api/dashboard?endpoint=competitiveness&limit=30'),
        fetch('/supplier-portal/api/dashboard?endpoint=rank-distribution'),
      ]);
      
      if (insightsRes.status === 401 || distributionRes.status === 401) {
        router.push('/supplier-portal/login');
        return;
      }
      
      if (insightsRes.ok) {
        const data = await insightsRes.json();
        setInsights(data.data);
      }
      
      if (distributionRes.ok) {
        const data = await distributionRes.json();
        setRankDistribution(data.data);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }
  
  // Calculate summary stats
  const rank1Count = insights.filter(i => i.recommendation_rank === 1).length;
  const avgPercentile = insights.length > 0 
    ? insights.reduce((sum, i) => sum + i.price_percentile, 0) / insights.length 
    : 0;
  const competitiveCount = insights.filter(i => i.price_percentile <= 30).length;
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Supplier Portal</h1>
            <p className="text-sm text-gray-500">Competitiveness Insights</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push('/supplier-portal/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
        
        <SupplierPortalSubNav />
      </header>
      
      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <p className="text-gray-500">Loading competitiveness data...</p>
        ) : (
          <div className="space-y-8">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-600">#1 Rankings</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-green-600">{rank1Count}</p>
                  <p className="text-xs text-gray-500">products</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-600">Avg Price Position</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{avgPercentile.toFixed(0)}%</p>
                  <p className="text-xs text-gray-500">of market</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-600">Competitive Prices</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-green-600">{competitiveCount}</p>
                  <p className="text-xs text-gray-500">in bottom 30%</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-600">Products Tracked</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{insights.length}</p>
                  <p className="text-xs text-gray-500">with recommendations</p>
                </CardContent>
              </Card>
            </div>
            
            {/* Rank Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Your Rank Distribution (30 days)</CardTitle>
              </CardHeader>
              <CardContent>
                {rankDistribution.length === 0 ? (
                  <p className="text-gray-500">No ranking data available</p>
                ) : (
                  <RankDistributionChart distribution={rankDistribution} />
                )}
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Improve your rank:</strong> Maintain competitive pricing, keep offers fresh, 
                    and provide complete product data (case pack, MOQ, lead time) to increase trust scores.
                  </p>
                </div>
              </CardContent>
            </Card>
            
            {/* Product Insights */}
            <Card>
              <CardHeader>
                <CardTitle>Product-Level Insights</CardTitle>
              </CardHeader>
              <CardContent>
                {insights.length === 0 ? (
                  <p className="text-gray-500">No competitiveness data available</p>
                ) : (
                  <div className="space-y-4">
                    {insights.map(insight => (
                      <div key={insight.product_id} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-medium">
                              {insight.product_name || `Product ${insight.product_id.slice(0, 8)}...`}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <RankBadge rank={insight.recommendation_rank} />
                              <Badge variant="outline">{insight.recommendation_band}</Badge>
                              {insight.trust_score !== null && (
                                <span className="text-xs text-gray-500">
                                  Trust: {(insight.trust_score * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => router.push('/supplier-portal/offers')}
                          >
                            Edit Price
                          </Button>
                        </div>
                        <PricePositionBar 
                          percentile={insight.price_percentile}
                          yourPrice={insight.supplier_price}
                          avgPrice={insight.market_avg}
                          minPrice={insight.market_min}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
