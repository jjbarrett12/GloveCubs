/**
 * Admin Review Action API
 * 
 * Handles approve/reject/resolve actions on review items
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { emitSystemEvent } from '@/lib/events/emit';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
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
}

// Validate admin request (placeholder - add real auth)
function validateAdminRequest(request: Request): boolean {
  // TODO: Add proper authentication
  // For now, check for admin secret or development mode
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${adminSecret}`) {
      return false;
    }
  }
  return true;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const { id, action } = await params;

  // Validate action
  const validActions = ['approve', 'reject', 'resolve', 'start'];
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action: ${action}` },
      { status: 400 }
    );
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return NextResponse.json(
      { error: 'Invalid review ID format' },
      { status: 400 }
    );
  }

  const supabase = await getSupabase();

  // Get current review item
  const { data: review, error: fetchError } = await supabase
    .from('review_queue')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !review) {
    return NextResponse.json(
      { error: 'Review item not found' },
      { status: 404 }
    );
  }

  // Validate state transition
  const validTransitions: Record<string, string[]> = {
    open: ['in_review', 'approved', 'rejected', 'resolved'],
    in_review: ['approved', 'rejected', 'resolved', 'open'],
    approved: [],
    rejected: [],
    resolved: [],
  };

  const newStatus = action === 'start' ? 'in_review' 
    : action === 'approve' ? 'approved'
    : action === 'reject' ? 'rejected'
    : 'resolved';

  if (!validTransitions[review.status]?.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot ${action} item in ${review.status} status` },
      { status: 400 }
    );
  }

  // Parse request body for notes
  let notes: string | undefined;
  try {
    const body = await request.json();
    notes = body.notes;
  } catch {
    // No body or invalid JSON - continue without notes
  }

  // Update review item
  const updateData: Record<string, unknown> = {
    status: newStatus,
  };

  if (['approved', 'rejected', 'resolved'].includes(newStatus)) {
    updateData.resolved_at = new Date().toISOString();
    // TODO: Add resolved_by when auth is implemented
    if (notes) {
      updateData.resolved_notes = notes;
    }
  }

  const { error: updateError } = await supabase
    .from('review_queue')
    .update(updateData)
    .eq('id', id);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to ${action}: ${updateError.message}` },
      { status: 500 }
    );
  }

  // Emit system event for resolved items
  if (['approved', 'rejected', 'resolved'].includes(newStatus)) {
    await emitSystemEvent({
      event_type: 'manual_review_resolved',
      source_table: 'review_queue',
      source_id: id,
      payload: {
        review_type: review.review_type,
        action: newStatus,
        original_source_table: review.source_table,
        original_source_id: review.source_id,
        approved: newStatus === 'approved',
      },
    });
  }

  // Redirect back to review queue for form submissions
  const referer = request.headers.get('referer');
  if (referer && request.headers.get('content-type')?.includes('form')) {
    return NextResponse.redirect(referer);
  }

  return NextResponse.json({
    success: true,
    id,
    action,
    new_status: newStatus,
  });
}
