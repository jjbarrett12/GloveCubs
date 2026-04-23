/**
 * System Event Processor Job Handler
 * 
 * Processes system events and creates appropriate followup jobs.
 */

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import { enqueueJob, generateDedupeKey } from '../enqueue';
import type { 
  JobExecutionResult, 
  SystemEventProcessorPayload,
  EnqueueJobInput,
  SystemEventRow
} from '../../agents/types';

export async function handleSystemEventProcessor(
  payload: Record<string, unknown>
): Promise<JobExecutionResult> {
  const input = payload as SystemEventProcessorPayload;
  const followupJobs: EnqueueJobInput[] = [];

  try {
    // Get unprocessed events
    let query = supabaseAdmin
      .from('system_events')
      .select('*')
      .eq('status', 'new')
      .order('created_at', { ascending: true });

    if (input.event_ids && input.event_ids.length > 0) {
      query = query.in('id', input.event_ids);
    }

    if (input.event_types && input.event_types.length > 0) {
      query = query.in('event_type', input.event_types);
    }

    const limit = input.batch_size ?? 50;
    query = query.limit(limit);

    const { data: events, error: fetchError } = await query;

    if (fetchError) {
      return {
        success: false,
        error: `Failed to fetch events: ${fetchError.message}`,
      };
    }

    if (!events || events.length === 0) {
      return {
        success: true,
        output: { message: 'No events to process', processed: 0 },
      };
    }

    logger.info('Processing system events', { count: events.length });

    let processedCount = 0;
    let ignoredCount = 0;
    let failedCount = 0;

    for (const event of events as SystemEventRow[]) {
      try {
        const jobs = mapEventToJobs(event);
        
        if (jobs.length === 0) {
          // No jobs to create - mark as ignored
          await supabaseAdmin
            .from('system_events')
            .update({
              status: 'ignored',
              processed_at: new Date().toISOString(),
            })
            .eq('id', event.id);
          
          ignoredCount++;
          continue;
        }

        // Enqueue jobs
        for (const jobInput of jobs) {
          await enqueueJob(jobInput);
          followupJobs.push(jobInput);
        }

        // Mark event as processed
        await supabaseAdmin
          .from('system_events')
          .update({
            status: 'processed',
            processed_at: new Date().toISOString(),
          })
          .eq('id', event.id);

        processedCount++;

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        
        await supabaseAdmin
          .from('system_events')
          .update({
            status: 'failed',
            error_message: message,
            processed_at: new Date().toISOString(),
          })
          .eq('id', event.id);

        failedCount++;
        logger.error('Failed to process event', { event_id: event.id, error: message });
      }
    }

    return {
      success: true,
      output: {
        processed: processedCount,
        ignored: ignoredCount,
        failed: failedCount,
        jobs_created: followupJobs.length,
      },
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('System event processor failed', { error: message });
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Map system events to job creation inputs
 */
function mapEventToJobs(event: SystemEventRow): EnqueueJobInput[] {
  const jobs: EnqueueJobInput[] = [];

  // Helper to convert null to undefined for optional fields
  const toUndefined = <T>(val: T | null): T | undefined => val ?? undefined;

  switch (event.event_type) {
    case 'supplier_file_uploaded':
      jobs.push({
        job_type: 'supplier_ingestion',
        payload: {
          file_id: toUndefined(event.source_id),
          supplier_id: event.payload.supplier_id as string | undefined,
          format: event.payload.format as 'csv' | 'json' | 'xlsx' | undefined,
        },
        source_table: toUndefined(event.source_table),
        source_id: toUndefined(event.source_id),
        dedupe_key: generateDedupeKey('supplier_ingestion', toUndefined(event.source_table), toUndefined(event.source_id)),
        priority: 40,
      });
      break;

    case 'supplier_ingestion_completed':
      // Product normalization jobs are created by the ingestion handler
      break;

    case 'product_normalization_completed':
      // Product match jobs are created by the normalization handler
      break;

    case 'product_match_uncertain':
      // Review item is already created by match handler
      break;

    case 'supplier_cost_changed':
      jobs.push({
        job_type: 'pricing_recommendation',
        payload: {
          product_id: event.source_id ?? '',
          trigger_reason: 'cost_change',
          ...event.payload,
        },
        source_table: toUndefined(event.source_table),
        source_id: toUndefined(event.source_id),
        dedupe_key: generateDedupeKey('pricing_recommendation', toUndefined(event.source_table), toUndefined(event.source_id), 'cost_change'),
        priority: 30,
      });
      break;

    case 'competitor_price_check_completed':
      // Pricing recommendation jobs are created by price check handler
      break;

    case 'manual_review_resolved':
      // Handle any post-review automation
      if (event.payload.review_type === 'pricing' && event.payload.approved) {
        // Could trigger price update job
      }
      break;

    default:
      logger.debug('No job mapping for event type', { event_type: event.event_type });
  }

  return jobs;
}
