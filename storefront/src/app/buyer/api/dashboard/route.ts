/**
 * Buyer Intelligence Dashboard API
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  getBuyerDashboardSummary,
  getSavingsSummary,
  getMarketIntelligence,
  getSupplierComparison,
  getProcurementRisks,
  getSpendAnalytics,
  getSavingsOpportunities,
  getSupplierRiskForecasts,
  getAIExplanation,
} from '@/lib/buyer-intelligence/dashboard';

async function getBuyerFromSession(): Promise<string | null> {
  const cookieStore = await cookies();
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return null;
  // Identity = auth user id (portal profile is public.users with same id; no separate buyer profile table).
  return user.id;
}

export async function GET(request: NextRequest) {
  try {
    const buyer_id = await getBuyerFromSession();
    
    if (!buyer_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');
    
    switch (endpoint) {
      case 'summary': {
        const summary = await getBuyerDashboardSummary(buyer_id);
        return NextResponse.json({ data: summary });
      }
      
      case 'savings': {
        const savings = await getSavingsSummary(buyer_id);
        return NextResponse.json({ data: savings });
      }
      
      case 'market-intelligence': {
        const productIds = searchParams.get('product_ids')?.split(',').filter(Boolean);
        const intel = await getMarketIntelligence(buyer_id, productIds);
        return NextResponse.json({ data: intel });
      }
      
      case 'supplier-comparison': {
        const productId = searchParams.get('product_id');
        if (!productId) {
          return NextResponse.json({ error: 'product_id required' }, { status: 400 });
        }
        const comparison = await getSupplierComparison(buyer_id, productId);
        return NextResponse.json({ data: comparison });
      }
      
      case 'risks': {
        const risks = await getProcurementRisks(buyer_id);
        return NextResponse.json({ data: risks });
      }
      
      case 'spend': {
        const facility = searchParams.get('facility') || undefined;
        const department = searchParams.get('department') || undefined;
        const start_date = searchParams.get('start_date') || undefined;
        const end_date = searchParams.get('end_date') || undefined;
        
        const spend = await getSpendAnalytics(buyer_id, {
          facility,
          department,
          start_date,
          end_date,
        });
        return NextResponse.json({ data: spend });
      }
      
      case 'opportunities': {
        const limit = parseInt(searchParams.get('limit') || '20');
        const opportunities = await getSavingsOpportunities(buyer_id, limit);
        return NextResponse.json({ data: opportunities });
      }
      
      case 'supplier-forecasts': {
        const forecasts = await getSupplierRiskForecasts(buyer_id);
        return NextResponse.json({ data: forecasts });
      }
      
      case 'ai-explanation': {
        const productId = searchParams.get('product_id');
        if (!productId) {
          return NextResponse.json({ error: 'product_id required' }, { status: 400 });
        }
        const explanation = await getAIExplanation(productId);
        return NextResponse.json({ data: explanation });
      }
      
      default:
        return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
    }
  } catch (error) {
    console.error('Buyer dashboard API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
