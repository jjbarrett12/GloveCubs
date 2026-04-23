/**
 * Product Search API
 * 
 * GET /api/products/search?q=query&limit=20&offset=0
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchProducts, getAutocompleteSuggestions } from '@/lib/search';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  try {
    const limitRaw = parseInt(searchParams.get('limit') ?? '20', 10);
    const offsetRaw = parseInt(searchParams.get('offset') ?? '0', 10);
    const limit = Number.isFinite(limitRaw) && limitRaw >= 0 ? Math.min(limitRaw, 100) : 20;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    const mode = searchParams.get('mode') || 'search'; // 'search' or 'autocomplete'
    
    // Filters
    const material = searchParams.get('material') || undefined;
    const size = searchParams.get('size') || undefined;
    const category = searchParams.get('category') || undefined;
    const minPriceParam = searchParams.get('min_price');
    const maxPriceParam = searchParams.get('max_price');
    const minPrice = minPriceParam != null ? parseFloat(minPriceParam) : undefined;
    const maxPrice = maxPriceParam != null ? parseFloat(maxPriceParam) : undefined;
    
    // Validation
    if (!query) {
      return NextResponse.json(
        { error: 'Search query required', code: 'MISSING_QUERY' },
        { status: 400 }
      );
    }
    
    if (query.length < 2) {
      return NextResponse.json(
        { error: 'Search query must be at least 2 characters', code: 'QUERY_TOO_SHORT' },
        { status: 400 }
      );
    }
    
    if (limit > 100) {
      return NextResponse.json(
        { error: 'Limit cannot exceed 100', code: 'LIMIT_EXCEEDED' },
        { status: 400 }
      );
    }
    
    // Autocomplete mode
    if (mode === 'autocomplete') {
      const suggestions = await getAutocompleteSuggestions(query, Math.min(limit, 10));
      return NextResponse.json({
        suggestions,
        query,
      });
    }
    
    // Full search
    const result = await searchProducts(query, {
      limit,
      offset,
      filters: {
        material,
        size,
        category,
        min_price: minPrice,
        max_price: maxPrice,
      },
      include_offers: true,
    });
    
    return NextResponse.json(result);
    
  } catch (error) {
    try {
      const { logSearchFailure } = await import('@/lib/hardening/telemetry');
      await logSearchFailure(error instanceof Error ? error.message : 'Search failed', {
        query: String(query).slice(0, 200),
        phase: 'route',
        error_code: error instanceof Error ? error.name : 'SEARCH_ERROR',
      });
    } catch {
      // non-fatal
    }
    return NextResponse.json(
      { error: 'Search failed', code: 'SEARCH_ERROR' },
      { status: 500 }
    );
  }
}
