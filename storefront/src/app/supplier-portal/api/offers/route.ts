/**
 * Supplier Portal Offers API
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/supplier-portal/auth';
import {
  listOffers,
  getOffer,
  createOffer,
  updateOffer,
  bulkUpdatePrices,
  deactivateOffer,
  reactivateOffer,
  bulkUploadOffers,
  searchProducts,
} from '@/lib/supplier-portal/offers';

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
    const action = searchParams.get('action');
    
    switch (action) {
      case 'list': {
        const result = await listOffers(session.supplier_id, {
          active_only: searchParams.get('active_only') === 'true',
          stale_only: searchParams.get('stale_only') === 'true',
          search: searchParams.get('search') || undefined,
          limit: parseInt(searchParams.get('limit') || '50'),
          offset: parseInt(searchParams.get('offset') || '0'),
        });
        return NextResponse.json(result);
      }
      
      case 'get': {
        const offerId = searchParams.get('id');
        if (!offerId) {
          return NextResponse.json({ error: 'Offer ID required' }, { status: 400 });
        }
        const offer = await getOffer(session.supplier_id, offerId);
        if (!offer) {
          return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
        }
        return NextResponse.json({ data: offer });
      }
      
      case 'search-products': {
        const search = searchParams.get('search');
        if (!search) {
          return NextResponse.json({ error: 'Search term required' }, { status: 400 });
        }
        const products = await searchProducts(search, session.supplier_id);
        return NextResponse.json({ data: products });
      }
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Offers API GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSupplierFromSession(request);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { action } = body;
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    
    switch (action) {
      case 'create': {
        const result = await createOffer(
          session.supplier_id,
          session.user_id,
          body.offer,
          ipAddress
        );
        
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        
        return NextResponse.json({ data: result.offer });
      }
      
      case 'update': {
        if (!body.offer_id) {
          return NextResponse.json({ error: 'Offer ID required' }, { status: 400 });
        }
        
        const result = await updateOffer(
          session.supplier_id,
          session.user_id,
          body.offer_id,
          body.updates,
          ipAddress
        );
        
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        
        return NextResponse.json({ data: result.offer });
      }
      
      case 'bulk-update-prices': {
        const result = await bulkUpdatePrices(
          session.supplier_id,
          session.user_id,
          body.updates,
          ipAddress
        );
        
        return NextResponse.json(result);
      }
      
      case 'deactivate': {
        if (!body.offer_id) {
          return NextResponse.json({ error: 'Offer ID required' }, { status: 400 });
        }
        
        const result = await deactivateOffer(
          session.supplier_id,
          session.user_id,
          body.offer_id,
          ipAddress
        );
        
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        
        return NextResponse.json({ success: true });
      }
      
      case 'reactivate': {
        if (!body.offer_id) {
          return NextResponse.json({ error: 'Offer ID required' }, { status: 400 });
        }
        
        const result = await reactivateOffer(
          session.supplier_id,
          session.user_id,
          body.offer_id,
          ipAddress
        );
        
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        
        return NextResponse.json({ success: true });
      }
      
      case 'bulk-upload': {
        const result = await bulkUploadOffers(
          session.supplier_id,
          session.user_id,
          body.rows,
          ipAddress
        );
        
        return NextResponse.json(result);
      }
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Offers API POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
