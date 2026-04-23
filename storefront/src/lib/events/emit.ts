/**
 * System Events - Emit
 * 
 * Emits system events that trigger jobs.
 */

import { supabaseAdmin } from '../jobs/supabase';
import { logger } from '../jobs/logger';
import type { SystemEventInput, SystemEventRow } from '../agents/types';

/**
 * Emit a system event
 */
export async function emitSystemEvent(input: SystemEventInput): Promise<SystemEventRow | null> {
  const { data, error } = await supabaseAdmin
    .from('system_events')
    .insert({
      event_type: input.event_type,
      source_table: input.source_table,
      source_id: input.source_id,
      payload: input.payload ?? {},
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to emit system event', {
      event_type: input.event_type,
      error: error.message,
    });
    return null;
  }

  logger.info('System event emitted', {
    event_id: data.id,
    event_type: input.event_type,
    source: input.source_table ? `${input.source_table}:${input.source_id}` : null,
  });

  return data as SystemEventRow;
}

/**
 * Emit multiple system events
 */
export async function emitSystemEvents(inputs: SystemEventInput[]): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('system_events')
    .insert(
      inputs.map(input => ({
        event_type: input.event_type,
        source_table: input.source_table,
        source_id: input.source_id,
        payload: input.payload ?? {},
      }))
    )
    .select('id');

  if (error) {
    logger.error('Failed to emit system events', {
      count: inputs.length,
      error: error.message,
    });
    return 0;
  }

  logger.info('System events emitted', {
    count: data?.length ?? 0,
    types: Array.from(new Set(inputs.map(i => i.event_type))),
  });

  return data?.length ?? 0;
}

/**
 * Get pending system events
 */
export async function getPendingEvents(
  limit: number = 100,
  eventTypes?: string[]
): Promise<SystemEventRow[]> {
  let query = supabaseAdmin
    .from('system_events')
    .select('*')
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (eventTypes && eventTypes.length > 0) {
    query = query.in('event_type', eventTypes);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Failed to get pending events', { error: error.message });
    return [];
  }

  return data as SystemEventRow[];
}

/**
 * Get recent events for monitoring
 */
export async function getRecentEvents(
  hours: number = 24,
  limit: number = 100
): Promise<SystemEventRow[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const { data, error } = await supabaseAdmin
    .from('system_events')
    .select('*')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('Failed to get recent events', { error: error.message });
    return [];
  }

  return data as SystemEventRow[];
}

/**
 * Get event statistics
 */
export async function getEventStats(hours: number = 24): Promise<Record<string, number>> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const { data, error } = await supabaseAdmin
    .from('system_events')
    .select('status')
    .gte('created_at', since.toISOString());

  if (error) {
    return {};
  }

  return (data || []).reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
