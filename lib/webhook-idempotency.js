/**
 * Webhook Idempotency Tracker
 * 
 * Tracks processed Stripe webhook event IDs to prevent duplicate processing.
 * Uses in-memory cache with Supabase backup for persistence.
 */

const { getSupabaseAdmin, isSupabaseAdminConfigured } = require('./supabaseAdmin');

const processedEvents = new Map();
const MAX_CACHE_SIZE = 10000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if an event has already been processed.
 * Returns true if this is a duplicate.
 */
async function isDuplicateEvent(eventId) {
  if (!eventId) return false;
  
  if (processedEvents.has(eventId)) {
    return true;
  }
  
  if (isSupabaseAdminConfigured()) {
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from('stripe_webhook_events')
        .select('id')
        .eq('event_id', eventId)
        .maybeSingle();
      
      if (data) {
        processedEvents.set(eventId, { at: Date.now() });
        return true;
      }
    } catch (err) {
      console.error('[webhook-idempotency] DB check failed:', err.message);
    }
  }
  
  return false;
}

/**
 * Mark an event as processed.
 */
async function markEventProcessed(eventId, eventType, orderId = null, status = 'processed') {
  if (!eventId) return;
  
  processedEvents.set(eventId, { at: Date.now() });
  
  if (processedEvents.size > MAX_CACHE_SIZE) {
    const cutoff = Date.now() - CACHE_TTL_MS;
    for (const [key, val] of processedEvents.entries()) {
      if (val.at < cutoff) {
        processedEvents.delete(key);
      }
    }
    
    if (processedEvents.size > MAX_CACHE_SIZE * 0.9) {
      const entries = Array.from(processedEvents.entries());
      entries.sort((a, b) => a[1].at - b[1].at);
      const toRemove = entries.slice(0, Math.floor(MAX_CACHE_SIZE * 0.2));
      toRemove.forEach(([key]) => processedEvents.delete(key));
    }
  }
  
  if (isSupabaseAdminConfigured()) {
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from('stripe_webhook_events').upsert({
        event_id: eventId,
        event_type: eventType,
        order_id: orderId,
        status,
        processed_at: new Date().toISOString(),
      }, { onConflict: 'event_id' });
    } catch (err) {
      console.error('[webhook-idempotency] DB insert failed:', err.message);
    }
  }
}

/**
 * Get event processing status.
 */
async function getEventStatus(eventId) {
  if (!eventId) return null;
  
  if (isSupabaseAdminConfigured()) {
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from('stripe_webhook_events')
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle();
      return data;
    } catch (err) {
      console.error('[webhook-idempotency] DB get failed:', err.message);
    }
  }
  
  return processedEvents.has(eventId) ? { event_id: eventId, status: 'processed' } : null;
}

/**
 * Clean up old events from the database.
 */
async function cleanupOldEvents(olderThanDays = 30) {
  if (!isSupabaseAdminConfigured()) return { deleted: 0 };
  
  try {
    const supabase = getSupabaseAdmin();
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('stripe_webhook_events')
      .delete()
      .lt('processed_at', cutoff)
      .select('id');
    
    if (error) throw error;
    return { deleted: data?.length || 0 };
  } catch (err) {
    console.error('[webhook-idempotency] Cleanup failed:', err.message);
    return { deleted: 0, error: err.message };
  }
}

module.exports = {
  isDuplicateEvent,
  markEventProcessed,
  getEventStatus,
  cleanupOldEvents,
};
