/**
 * Database Transaction Helpers
 * 
 * Provides transaction and advisory lock utilities for production safety.
 */

import { supabaseAdmin } from '../jobs/supabase';

/**
 * Execute a function within a database transaction.
 * Uses Postgres transaction via RPC.
 */
export async function withTransaction<T>(
  fn: () => Promise<T>,
  options?: {
    isolation?: 'read_committed' | 'repeatable_read' | 'serializable';
    timeout_ms?: number;
  }
): Promise<{ success: boolean; result?: T; error?: string }> {
  const isolation = options?.isolation || 'read_committed';
  const timeout = options?.timeout_ms || 30000;
  
  try {
    // Begin transaction
    await supabaseAdmin.rpc('begin_transaction', { 
      p_isolation_level: isolation,
      p_timeout_ms: timeout 
    });
    
    try {
      const result = await fn();
      
      // Commit
      await supabaseAdmin.rpc('commit_transaction');
      
      return { success: true, result };
    } catch (error) {
      // Rollback on error
      await supabaseAdmin.rpc('rollback_transaction');
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Transaction failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Acquire an advisory lock for a specific entity.
 * Returns a release function.
 */
export async function acquireAdvisoryLock(
  entity_type: string,
  entity_id: string,
  timeout_ms: number = 5000
): Promise<{ acquired: boolean; release: () => Promise<void>; error?: string }> {
  // Create a numeric hash from entity type and id
  const lockKey = hashStringToNumber(`${entity_type}:${entity_id}`);
  
  try {
    const { data, error } = await supabaseAdmin.rpc('pg_try_advisory_lock', {
      lock_id: lockKey
    });
    
    if (error) {
      // If RPC doesn't exist, simulate with table-based locking
      return acquireTableBasedLock(entity_type, entity_id, timeout_ms);
    }
    
    if (!data) {
      return { 
        acquired: false, 
        release: async () => {},
        error: 'Lock already held by another process' 
      };
    }
    
    return {
      acquired: true,
      release: async () => {
        await supabaseAdmin.rpc('pg_advisory_unlock', { lock_id: lockKey });
      },
    };
  } catch (error) {
    // Fallback to table-based locking
    return acquireTableBasedLock(entity_type, entity_id, timeout_ms);
  }
}

/**
 * Table-based locking fallback for when advisory locks aren't available.
 */
async function acquireTableBasedLock(
  entity_type: string,
  entity_id: string,
  timeout_ms: number
): Promise<{ acquired: boolean; release: () => Promise<void>; error?: string }> {
  const lockId = `${entity_type}:${entity_id}`;
  const expires_at = new Date(Date.now() + timeout_ms).toISOString();
  
  try {
    // Try to insert lock record
    const { error: insertError } = await supabaseAdmin
      .from('advisory_locks')
      .insert({
        lock_id: lockId,
        acquired_at: new Date().toISOString(),
        expires_at,
      });
      
    if (insertError) {
      // Check if existing lock has expired
      const { data: existing } = await supabaseAdmin
        .from('advisory_locks')
        .select('expires_at')
        .eq('lock_id', lockId)
        .single();
        
      if (existing && new Date(existing.expires_at) < new Date()) {
        // Expired lock, try to take it over
        const { error: updateError } = await supabaseAdmin
          .from('advisory_locks')
          .update({
            acquired_at: new Date().toISOString(),
            expires_at,
          })
          .eq('lock_id', lockId)
          .lt('expires_at', new Date().toISOString());
          
        if (updateError) {
          return { acquired: false, release: async () => {}, error: 'Lock contention' };
        }
      } else {
        return { acquired: false, release: async () => {}, error: 'Lock held by another process' };
      }
    }
    
    return {
      acquired: true,
      release: async () => {
        await supabaseAdmin
          .from('advisory_locks')
          .delete()
          .eq('lock_id', lockId);
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { acquired: false, release: async () => {}, error: message };
  }
}

/**
 * Execute a function while holding an advisory lock.
 */
export async function withAdvisoryLock<T>(
  entity_type: string,
  entity_id: string,
  fn: () => Promise<T>,
  options?: {
    timeout_ms?: number;
    retry_count?: number;
    retry_delay_ms?: number;
  }
): Promise<{ success: boolean; result?: T; error?: string }> {
  const timeout = options?.timeout_ms || 10000;
  const retryCount = options?.retry_count || 3;
  const retryDelay = options?.retry_delay_ms || 100;
  
  let lastError = '';
  
  for (let attempt = 0; attempt < retryCount; attempt++) {
    const lock = await acquireAdvisoryLock(entity_type, entity_id, timeout);
    
    if (lock.acquired) {
      try {
        const result = await fn();
        return { success: true, result };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
      } finally {
        await lock.release();
      }
    }
    
    lastError = lock.error || 'Failed to acquire lock';
    
    // Wait before retry
    if (attempt < retryCount - 1) {
      await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
    }
  }
  
  return { success: false, error: `Failed to acquire lock after ${retryCount} attempts: ${lastError}` };
}

/**
 * Convert a string to a consistent numeric hash for advisory locks.
 */
function hashStringToNumber(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
