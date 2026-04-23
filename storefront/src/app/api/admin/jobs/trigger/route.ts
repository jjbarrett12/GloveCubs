/**
 * Admin API: Trigger Job
 * 
 * POST /api/admin/jobs/trigger
 * 
 * Manually enqueue a job with specific payload.
 * Requires admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { JOB_TYPES, type JobType } from '@/lib/agents/types';

export async function POST(request: NextRequest) {
  try {
    // TODO: Add proper admin authentication
    const adminSecret = request.headers.get('x-admin-secret');
    if (process.env.ADMIN_SECRET && adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { job_type, payload, priority, dedupe_key } = body;

    // Validate job type
    if (!job_type || !JOB_TYPES.includes(job_type as JobType)) {
      return NextResponse.json(
        { error: 'Invalid job_type', valid_types: JOB_TYPES },
        { status: 400 }
      );
    }

    // Enqueue the job
    const result = await enqueueJob({
      job_type: job_type as JobType,
      payload: payload || {},
      priority: priority || 50,
      dedupe_key,
      created_by: 'admin_trigger',
    });

    return NextResponse.json({
      success: true,
      job_id: result.job.id,
      job_status: result.job.status,
      was_created: result.created,
      message: result.dedupe_matched 
        ? 'Job already exists with this dedupe key'
        : 'Job enqueued successfully',
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return available job types for convenience
  return NextResponse.json({
    available_job_types: JOB_TYPES,
    example_payloads: {
      supplier_discovery: {
        search_terms: ['gloves', 'ppe'],
        categories: ['disposable_gloves'],
        max_results: 50,
      },
      supplier_ingestion: {
        supplier_id: '<uuid>',
        file_url: 'https://example.com/catalog.csv',
        format: 'csv',
      },
      product_normalization: {
        product_id: '<uuid>',
        supplier_id: '<uuid>',
      },
      product_match: {
        normalized_product_id: '<uuid>',
      },
      competitor_price_check: {
        product_ids: ['<uuid>'],
        priority_tier: 'high',
      },
      pricing_recommendation: {
        product_id: '<uuid>',
        trigger_reason: 'manual',
      },
      daily_price_guard: {
        include_long_tail: false,
        run_date: new Date().toISOString().split('T')[0],
      },
      audit_run: {
        full_audit: true,
        dry_run: false,
      },
    },
  });
}
