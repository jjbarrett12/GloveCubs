/**
 * Rate Limiter for Authentication Endpoints
 * 
 * Provides sliding window rate limiting with IP-based and credential-based tracking.
 */

import { supabaseAdmin } from '../jobs/supabase';

export interface RateLimitConfig {
  window_ms: number;        // Time window in milliseconds
  max_requests: number;     // Max requests per window
  block_duration_ms: number; // How long to block after limit exceeded
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset_at: Date;
  blocked_until?: Date;
  reason?: string;
}

// Default configurations
export const RATE_LIMIT_CONFIGS = {
  login: {
    window_ms: 15 * 60 * 1000,  // 15 minutes
    max_requests: 10,           // 10 attempts
    block_duration_ms: 30 * 60 * 1000, // 30 min block
  },
  password_reset: {
    window_ms: 60 * 60 * 1000,  // 1 hour
    max_requests: 3,            // 3 attempts
    block_duration_ms: 60 * 60 * 1000, // 1 hour block
  },
  api_key: {
    window_ms: 60 * 1000,       // 1 minute
    max_requests: 60,           // 60 requests
    block_duration_ms: 5 * 60 * 1000, // 5 min block
  },
} as const;

// In-memory store for rate limiting (use Redis in production cluster)
const rateLimitStore = new Map<string, {
  count: number;
  window_start: number;
  blocked_until?: number;
}>();

/**
 * Check if a request is allowed under rate limits.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.login
): Promise<RateLimitResult> {
  const now = Date.now();
  const key = `rate_limit:${identifier}`;
  
  // Try database-backed rate limiting first
  try {
    const result = await checkDatabaseRateLimit(identifier, config);
    return result;
  } catch {
    // Fallback to in-memory
    return checkInMemoryRateLimit(key, config, now);
  }
}

/**
 * Database-backed rate limiting (survives restarts, works in clusters).
 */
async function checkDatabaseRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - config.window_ms);
  
  // Check for active blocks
  const { data: block } = await supabaseAdmin
    .from('rate_limit_blocks')
    .select('blocked_until')
    .eq('identifier', identifier)
    .gt('blocked_until', now.toISOString())
    .single();
    
  if (block) {
    return {
      allowed: false,
      remaining: 0,
      reset_at: new Date(block.blocked_until),
      blocked_until: new Date(block.blocked_until),
      reason: 'Rate limit exceeded, temporarily blocked',
    };
  }
  
  // Count recent requests
  const { count } = await supabaseAdmin
    .from('rate_limit_events')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .gte('created_at', windowStart.toISOString());
    
  const requestCount = count || 0;
  const remaining = Math.max(0, config.max_requests - requestCount - 1);
  const resetAt = new Date(now.getTime() + config.window_ms);
  
  if (requestCount >= config.max_requests) {
    // Block this identifier
    const blockedUntil = new Date(now.getTime() + config.block_duration_ms);
    
    await supabaseAdmin
      .from('rate_limit_blocks')
      .upsert({
        identifier,
        blocked_until: blockedUntil.toISOString(),
        reason: 'Rate limit exceeded',
        created_at: now.toISOString(),
      });
      
    return {
      allowed: false,
      remaining: 0,
      reset_at: resetAt,
      blocked_until: blockedUntil,
      reason: 'Rate limit exceeded',
    };
  }
  
  // Record this request
  await supabaseAdmin
    .from('rate_limit_events')
    .insert({
      identifier,
      created_at: now.toISOString(),
    });
    
  return {
    allowed: true,
    remaining,
    reset_at: resetAt,
  };
}

/**
 * In-memory rate limiting fallback.
 */
function checkInMemoryRateLimit(
  key: string,
  config: RateLimitConfig,
  now: number
): RateLimitResult {
  let entry = rateLimitStore.get(key);
  
  // Check if blocked
  if (entry?.blocked_until && entry.blocked_until > now) {
    return {
      allowed: false,
      remaining: 0,
      reset_at: new Date(entry.blocked_until),
      blocked_until: new Date(entry.blocked_until),
      reason: 'Rate limit exceeded, temporarily blocked',
    };
  }
  
  // Check if window has expired
  if (!entry || now - entry.window_start > config.window_ms) {
    entry = { count: 0, window_start: now };
  }
  
  // Increment count
  entry.count++;
  
  const remaining = Math.max(0, config.max_requests - entry.count);
  const resetAt = new Date(entry.window_start + config.window_ms);
  
  // Check if limit exceeded
  if (entry.count > config.max_requests) {
    entry.blocked_until = now + config.block_duration_ms;
    rateLimitStore.set(key, entry);
    
    return {
      allowed: false,
      remaining: 0,
      reset_at: resetAt,
      blocked_until: new Date(entry.blocked_until),
      reason: 'Rate limit exceeded',
    };
  }
  
  rateLimitStore.set(key, entry);
  
  return {
    allowed: true,
    remaining,
    reset_at: resetAt,
  };
}

/**
 * Record a failed login attempt (increases rate limit impact).
 */
export async function recordFailedLogin(
  ipAddress: string,
  email?: string
): Promise<void> {
  const now = new Date().toISOString();
  
  try {
    // Record IP-based event (counts double)
    await supabaseAdmin
      .from('rate_limit_events')
      .insert([
        { identifier: `ip:${ipAddress}`, created_at: now },
        { identifier: `ip:${ipAddress}`, created_at: now }, // Double impact
      ]);
      
    // Record email-based event if provided
    if (email) {
      await supabaseAdmin
        .from('rate_limit_events')
        .insert({ identifier: `email:${email.toLowerCase()}`, created_at: now });
    }
  } catch {
    // Best effort
  }
}

/**
 * Clear rate limit for an identifier (e.g., after successful login).
 */
export async function clearRateLimit(identifier: string): Promise<void> {
  try {
    await supabaseAdmin
      .from('rate_limit_blocks')
      .delete()
      .eq('identifier', identifier);
      
    // Clean up old events
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from('rate_limit_events')
      .delete()
      .eq('identifier', identifier)
      .lt('created_at', cutoff);
  } catch {
    // Best effort
  }
  
  // Clear in-memory
  rateLimitStore.delete(`rate_limit:${identifier}`);
}

/**
 * Middleware helper to check rate limit before processing.
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  return async (identifier: string): Promise<RateLimitResult> => {
    return checkRateLimit(identifier, config);
  };
}

/**
 * Clean up expired rate limit data.
 */
export async function cleanupRateLimitData(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { data: eventsDeleted } = await supabaseAdmin
    .from('rate_limit_events')
    .delete()
    .lt('created_at', cutoff)
    .select('id');
    
  const { data: blocksDeleted } = await supabaseAdmin
    .from('rate_limit_blocks')
    .delete()
    .lt('blocked_until', new Date().toISOString())
    .select('id');
    
  return { deleted: (eventsDeleted?.length || 0) + (blocksDeleted?.length || 0) };
}
