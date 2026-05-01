/**
 * Admin Product Import API
 * 
 * Endpoints:
 * - POST: Import product from URL
 * - GET: List pending candidates / get single candidate
 * 
 * Admin-only access required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  importProductFromUrl,
  approveCandidate,
  rejectCandidate,
  getPendingCandidates,
  getCandidate,
} from '@/lib/admin/productImport';

// ============================================================================
// ADMIN AUTH CHECK
// ============================================================================

async function getAdminUser(request: NextRequest): Promise<{ id: string; email: string } | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
  
  // Get session
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  
  // Verify admin role
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id, email, is_active')
    .eq('id', session.user.id)
    .eq('is_active', true)
    .single();
    
  if (!adminUser) return null;
  
  return { id: adminUser.id, email: adminUser.email };
}

// ============================================================================
// GET - List candidates or get single candidate
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminUser(request);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    switch (action) {
      case 'list': {
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = parseInt(searchParams.get('offset') || '0');
        
        const result = await getPendingCandidates(limit, offset);
        return NextResponse.json({ 
          data: result.candidates,
          total: result.total,
          limit,
          offset,
        });
      }
      
      case 'get': {
        const candidateId = searchParams.get('id');
        if (!candidateId) {
          return NextResponse.json({ error: 'Candidate ID required' }, { status: 400 });
        }
        
        const candidate = await getCandidate(candidateId);
        if (!candidate) {
          return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
        }
        
        return NextResponse.json({ data: candidate });
      }
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Product import GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================================
// POST - Import, approve, or reject
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminUser(request);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 401 });
    }
    
    const body = await request.json();
    const { action } = body;
    
    switch (action) {
      case 'import': {
        const { url } = body;
        
        if (!url) {
          return NextResponse.json({ error: 'URL required' }, { status: 400 });
        }
        
        // Validate URL format
        try {
          new URL(url);
        } catch {
          return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
        }
        
        const result = await importProductFromUrl(url, admin.id);
        
        if (!result.success) {
          return NextResponse.json({
            error: result.error,
            status: result.status,
            details: {
              fetch_result: result.fetch_result,
              extraction_result: result.extraction_result,
            },
          }, { status: 400 });
        }
        
        return NextResponse.json({
          success: true,
          data: {
            candidate_id: result.candidate_id,
            status: result.status,
            candidate: result.candidate,
            duplicates: result.duplicates,
          },
        });
      }
      
      case 'approve': {
        const { candidate_id, merge_into_product_id, override_fields, notes } = body;
        
        if (!candidate_id) {
          return NextResponse.json({ error: 'Candidate ID required' }, { status: 400 });
        }
        
        const approvalAction = merge_into_product_id ? 'merge' : 'create';
        
        const result = await approveCandidate(candidate_id, admin.id, {
          action: approvalAction,
          merge_into_product_id,
          override_fields,
          notes,
        });
        
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        
        return NextResponse.json({
          success: true,
          action: result.action,
          product_id: result.product_id,
        });
      }
      
      case 'reject': {
        const { candidate_id, reason } = body;
        
        if (!candidate_id) {
          return NextResponse.json({ error: 'Candidate ID required' }, { status: 400 });
        }
        
        const result = await rejectCandidate(candidate_id, admin.id, reason || 'No reason provided');
        
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        
        return NextResponse.json({ success: true });
      }
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Product import POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
