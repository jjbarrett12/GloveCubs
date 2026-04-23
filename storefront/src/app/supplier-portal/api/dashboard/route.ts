/**
 * Supplier Portal Dashboard API
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/supplier-portal/auth';
import {
  getDashboardSummary,
  getOfferHealth,
  getCompetitivenessInsights,
  getRankDistribution,
  getFeedHealthMetrics,
  getRejectedRecommendationStats,
} from '@/lib/supplier-portal/dashboard';
import {
  getUploadHistory,
  getFeedUploadMetrics,
  getExtractionConfidenceDistribution,
  getValidationWarningCounts,
  getCorrectionMetrics,
  getLostOpportunities,
  getNearWinOpportunities,
  getActionItems,
  getCompetitivenessMetrics,
} from '@/lib/supplier-portal/dashboardIntelligence';

async function getSupplierFromSession(request: NextRequest): Promise<{ supplier_id: string; user_id: string } | null> {
  const token = request.cookies.get('supplier_session')?.value;
  if (!token) return null;
  
  const result = await validateSession(token);
  if (!result.valid || !result.supplier_id || !result.user) return null;
  
  return { supplier_id: result.supplier_id, user_id: result.user.id };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSupplierFromSession(request);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');
    
    switch (endpoint) {
      case 'summary': {
        const summary = await getDashboardSummary(session.supplier_id);
        return NextResponse.json({ data: summary });
      }
      
      case 'offer-health': {
        const limit = parseInt(searchParams.get('limit') || '50');
        const health = await getOfferHealth(session.supplier_id, limit);
        return NextResponse.json({ data: health });
      }
      
      case 'competitiveness': {
        const limit = parseInt(searchParams.get('limit') || '30');
        const insights = await getCompetitivenessInsights(session.supplier_id, limit);
        return NextResponse.json({ data: insights });
      }
      
      case 'rank-distribution': {
        const windowDays = parseInt(searchParams.get('window_days') || '30');
        const distribution = await getRankDistribution(session.supplier_id, windowDays);
        return NextResponse.json({ data: distribution });
      }
      
      case 'feed-health': {
        const metrics = await getFeedHealthMetrics(session.supplier_id);
        return NextResponse.json({ data: metrics });
      }
      
      case 'rejection-stats': {
        const windowDays = parseInt(searchParams.get('window_days') || '30');
        const stats = await getRejectedRecommendationStats(session.supplier_id, windowDays);
        return NextResponse.json({ data: stats });
      }
      
      case 'upload-history': {
        const limit = parseInt(searchParams.get('limit') || '20');
        const history = await getUploadHistory(session.supplier_id, limit);
        return NextResponse.json({ data: history });
      }
      
      case 'upload-metrics': {
        const metrics = await getFeedUploadMetrics(session.supplier_id);
        return NextResponse.json({ data: metrics });
      }
      
      case 'extraction-confidence': {
        const distribution = await getExtractionConfidenceDistribution(session.supplier_id);
        return NextResponse.json({ data: distribution });
      }
      
      case 'validation-warnings': {
        const counts = await getValidationWarningCounts(session.supplier_id);
        return NextResponse.json({ data: counts });
      }
      
      case 'correction-metrics': {
        const metrics = await getCorrectionMetrics(session.supplier_id);
        return NextResponse.json({ data: metrics });
      }
      
      case 'lost-opportunities': {
        const limit = parseInt(searchParams.get('limit') || '20');
        const opportunities = await getLostOpportunities(session.supplier_id, limit);
        return NextResponse.json({ data: opportunities });
      }
      
      case 'near-wins': {
        const limit = parseInt(searchParams.get('limit') || '10');
        const opportunities = await getNearWinOpportunities(session.supplier_id, limit);
        return NextResponse.json({ data: opportunities });
      }
      
      case 'action-items': {
        const items = await getActionItems(session.supplier_id);
        return NextResponse.json({ data: items });
      }
      
      case 'competitiveness-metrics': {
        const metrics = await getCompetitivenessMetrics(session.supplier_id);
        return NextResponse.json({ data: metrics });
      }
      
      default:
        return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
    }
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
