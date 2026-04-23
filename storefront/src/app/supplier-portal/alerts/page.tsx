'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// ============================================================================
// TYPES
// ============================================================================

interface SupplierAlert {
  id: string;
  alert_type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  details: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

interface AlertCounts {
  total: number;
  unread: number;
  critical: number;
  warning: number;
  info: number;
}

// ============================================================================
// COMPONENTS
// ============================================================================

function SeverityBadge({ severity }: { severity: 'critical' | 'warning' | 'info' }) {
  const colors = {
    critical: 'bg-red-600 text-white',
    warning: 'bg-yellow-500 text-black',
    info: 'bg-blue-500 text-white',
  };
  
  return <Badge className={colors[severity]}>{severity}</Badge>;
}

function AlertTypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    reliability_deterioration: '📉',
    stale_offers: '⏰',
    price_volatility: '📊',
    lost_recommendation_rank: '🔻',
    low_trust_offers: '⚠️',
    feed_quality_issue: '📋',
    anomaly_detected: '🔍',
    competitive_pressure: '🏃',
  };
  
  return <span className="text-xl">{icons[type] || '📌'}</span>;
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function SupplierAlertsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<SupplierAlert[]>([]);
  const [counts, setCounts] = useState<AlertCounts | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');
  
  useEffect(() => {
    loadAlerts();
  }, [filter]);
  
  async function loadAlerts() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ action: 'list' });
      if (filter === 'unread') params.set('unread_only', 'true');
      if (filter === 'critical') params.set('severity', 'critical');
      
      const [alertsRes, countsRes] = await Promise.all([
        fetch(`/supplier-portal/api/alerts?${params}`),
        fetch('/supplier-portal/api/alerts?action=counts'),
      ]);
      
      if (alertsRes.status === 401) {
        router.push('/supplier-portal/login');
        return;
      }
      
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setAlerts(data.alerts);
      }
      
      if (countsRes.ok) {
        const data = await countsRes.json();
        setCounts(data.data);
      }
    } catch (error) {
      console.error('Failed to load alerts:', error);
    } finally {
      setLoading(false);
    }
  }
  
  async function markAsRead(alertId: string) {
    try {
      await fetch('/supplier-portal/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-read', alert_id: alertId }),
      });
      loadAlerts();
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }
  
  async function markAllAsRead() {
    try {
      await fetch('/supplier-portal/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-all-read' }),
      });
      loadAlerts();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }
  
  async function dismissAlert(alertId: string) {
    try {
      await fetch('/supplier-portal/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', alert_id: alertId }),
      });
      loadAlerts();
    } catch (error) {
      console.error('Failed to dismiss alert:', error);
    }
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Supplier Portal</h1>
            <p className="text-sm text-gray-500">Alerts & Notifications</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push('/supplier-portal/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </header>
      
      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Summary Cards */}
        {counts && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Card className={counts.unread > 0 ? 'border-blue-200 bg-blue-50' : ''}>
              <CardContent className="pt-6">
                <p className="text-2xl font-bold">{counts.unread}</p>
                <p className="text-sm text-gray-600">Unread</p>
              </CardContent>
            </Card>
            <Card className={counts.critical > 0 ? 'border-red-200 bg-red-50' : ''}>
              <CardContent className="pt-6">
                <p className="text-2xl font-bold text-red-600">{counts.critical}</p>
                <p className="text-sm text-gray-600">Critical</p>
              </CardContent>
            </Card>
            <Card className={counts.warning > 0 ? 'border-yellow-200 bg-yellow-50' : ''}>
              <CardContent className="pt-6">
                <p className="text-2xl font-bold text-yellow-600">{counts.warning}</p>
                <p className="text-sm text-gray-600">Warnings</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-2xl font-bold text-blue-600">{counts.info}</p>
                <p className="text-sm text-gray-600">Info</p>
              </CardContent>
            </Card>
          </div>
        )}
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Your Alerts</CardTitle>
            <div className="flex gap-2">
              <div className="flex gap-1">
                <Button 
                  variant={filter === 'all' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setFilter('all')}
                >
                  All
                </Button>
                <Button 
                  variant={filter === 'unread' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setFilter('unread')}
                >
                  Unread
                </Button>
                <Button 
                  variant={filter === 'critical' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setFilter('critical')}
                >
                  Critical
                </Button>
              </div>
              {counts && counts.unread > 0 && (
                <Button variant="outline" size="sm" onClick={markAllAsRead}>
                  Mark All Read
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-gray-500">Loading alerts...</p>
            ) : alerts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">No alerts</p>
                <p className="text-gray-400 text-sm mt-1">You're all caught up!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map(alert => (
                  <div 
                    key={alert.id}
                    className={`p-4 border rounded-lg ${
                      !alert.is_read ? 'bg-blue-50 border-blue-200' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex gap-3">
                        <AlertTypeIcon type={alert.alert_type} />
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium">{alert.title}</h3>
                            <SeverityBadge severity={alert.severity} />
                            {!alert.is_read && (
                              <Badge className="bg-blue-100 text-blue-800">New</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{alert.message}</p>
                          <p className="text-xs text-gray-400 mt-2">
                            {new Date(alert.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!alert.is_read && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => markAsRead(alert.id)}
                          >
                            Mark Read
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => dismissAlert(alert.id)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                    
                    {/* Action Suggestions */}
                    {alert.severity === 'critical' && (
                      <div className="mt-3 p-3 bg-red-50 rounded border border-red-100">
                        <p className="text-sm text-red-800 font-medium mb-2">Recommended Action:</p>
                        {alert.alert_type === 'reliability_deterioration' && (
                          <Button size="sm" onClick={() => router.push('/supplier-portal/feed-health')}>
                            Review Feed Health
                          </Button>
                        )}
                        {alert.alert_type === 'stale_offers' && (
                          <Button size="sm" onClick={() => router.push('/supplier-portal/offers?filter=stale')}>
                            Update Stale Offers
                          </Button>
                        )}
                        {alert.alert_type === 'low_trust_offers' && (
                          <Button size="sm" onClick={() => router.push('/supplier-portal/offers')}>
                            Review Offers
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
