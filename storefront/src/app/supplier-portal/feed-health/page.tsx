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

interface FeedHealthMetrics {
  completeness_score: number;
  accuracy_rate: number;
  anomaly_count: number;
  correction_count: number;
  missing_fields: string[];
  recent_anomalies: Array<{
    type: string;
    product_id: string;
    detected_at: string;
  }>;
}

// ============================================================================
// COMPONENTS
// ============================================================================

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const percentage = score * 100;
  const color = percentage >= 80 ? 'text-green-600' : percentage >= 60 ? 'text-yellow-600' : 'text-red-600';
  const bgColor = percentage >= 80 ? 'bg-green-100' : percentage >= 60 ? 'bg-yellow-100' : 'bg-red-100';
  
  return (
    <div className={`p-6 rounded-lg ${bgColor} text-center`}>
      <p className={`text-4xl font-bold ${color}`}>{percentage.toFixed(0)}%</p>
      <p className="text-sm text-gray-600 mt-1">{label}</p>
    </div>
  );
}

function FieldCompletionItem({ field, status }: { field: string; status: 'complete' | 'incomplete' }) {
  const fieldLabels: Record<string, string> = {
    case_pack: 'Case Pack',
    box_quantity: 'Box Quantity',
    lead_time: 'Lead Time',
    moq: 'Minimum Order Qty',
  };
  
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <span className="font-medium">{fieldLabels[field] || field}</span>
      {status === 'complete' ? (
        <Badge className="bg-green-100 text-green-800">Complete</Badge>
      ) : (
        <Badge className="bg-red-100 text-red-800">Missing on many offers</Badge>
      )}
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function SupplierFeedHealthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<FeedHealthMetrics | null>(null);
  
  useEffect(() => {
    loadData();
  }, []);
  
  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/supplier-portal/api/dashboard?endpoint=feed-health');
      
      if (res.status === 401) {
        router.push('/supplier-portal/login');
        return;
      }
      
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.data);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }
  
  const allRequiredFields = ['case_pack', 'box_quantity', 'lead_time', 'moq'];
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Supplier Portal</h1>
            <p className="text-sm text-gray-500">Feed Health</p>
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
          <p className="text-gray-500">Loading feed health data...</p>
        ) : !metrics ? (
          <p className="text-gray-500">Unable to load feed health data</p>
        ) : (
          <div className="space-y-8">
            {/* Score Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ScoreGauge score={metrics.completeness_score} label="Data Completeness" />
              <ScoreGauge score={metrics.accuracy_rate} label="Data Accuracy" />
            </div>
            
            {/* Field Completion */}
            <Card>
              <CardHeader>
                <CardTitle>Required Field Completion</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {allRequiredFields.map(field => (
                    <FieldCompletionItem 
                      key={field}
                      field={field}
                      status={metrics.missing_fields.includes(field) ? 'incomplete' : 'complete'}
                    />
                  ))}
                </div>
                {metrics.missing_fields.length > 0 && (
                  <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <strong>Action Required:</strong> Add missing data to your offers to improve completeness score and trust ratings.
                    </p>
                    <Button 
                      size="sm" 
                      className="mt-2"
                      onClick={() => router.push('/supplier-portal/offers')}
                    >
                      Update Offers
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Quality Issues */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Anomalies Detected (30 days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-4xl font-bold text-red-600">{metrics.anomaly_count}</span>
                    <Badge className={metrics.anomaly_count === 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                      {metrics.anomaly_count === 0 ? 'Clean' : 'Needs Review'}
                    </Badge>
                  </div>
                  {metrics.recent_anomalies.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-500 mb-2">Recent anomalies:</p>
                      {metrics.recent_anomalies.slice(0, 5).map((anomaly, i) => (
                        <div key={i} className="p-2 bg-gray-50 rounded text-sm">
                          <span className="font-medium">{anomaly.type}</span>
                          <span className="text-gray-500 ml-2">
                            - {new Date(anomaly.detected_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No recent anomalies detected. Great job!</p>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Corrections Applied (30 days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-4xl font-bold text-yellow-600">{metrics.correction_count}</span>
                    <Badge className={metrics.correction_count === 0 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                      {metrics.correction_count === 0 ? 'No corrections' : 'Corrected'}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500">
                    {metrics.correction_count === 0 
                      ? 'Your data has not required any corrections.'
                      : 'Your data was corrected by our quality system. Review your product data for accuracy.'}
                  </p>
                </CardContent>
              </Card>
            </div>
            
            {/* Tips */}
            <Card>
              <CardHeader>
                <CardTitle>Improve Your Feed Quality</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">Data Completeness</h4>
                    <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
                      <li>Include case pack size for all offers</li>
                      <li>Specify box quantities for wholesale orders</li>
                      <li>Provide accurate lead times</li>
                      <li>Set minimum order quantities</li>
                    </ul>
                  </div>
                  
                  <div className="p-4 bg-green-50 rounded-lg">
                    <h4 className="font-medium text-green-900 mb-2">Data Accuracy</h4>
                    <ul className="list-disc list-inside text-sm text-green-800 space-y-1">
                      <li>Keep prices up to date (at least monthly)</li>
                      <li>Verify product descriptions match actual inventory</li>
                      <li>Use consistent unit measurements</li>
                      <li>Avoid extreme price changes that trigger anomaly detection</li>
                    </ul>
                  </div>
                  
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <h4 className="font-medium text-purple-900 mb-2">Trust Score Impact</h4>
                    <p className="text-sm text-purple-800">
                      Higher feed quality directly improves your trust scores, which influences your 
                      recommendation rankings. Suppliers with complete, accurate, and fresh data are 
                      more likely to be recommended to buyers.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
