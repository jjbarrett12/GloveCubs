/**
 * Supplier Portal Authentication
 * 
 * Handles supplier user authentication and session management.
 * All actions are audited and supplier_id scoped.
 */

import { supabaseAdmin } from '../jobs/supabase';
import { createHash, randomBytes } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface SupplierUser {
  id: string;
  supplier_id: string;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  is_active: boolean;
  last_login_at: string | null;
}

export interface SupplierSession {
  id: string;
  user_id: string;
  supplier_id: string;
  token: string;
  expires_at: string;
}

export interface AuthResult {
  success: boolean;
  user?: SupplierUser;
  session?: SupplierSession;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const AUTH_CONFIG = {
  session_duration_hours: 24,
  max_login_attempts: 5,
  lockout_duration_minutes: 30,
};

// ============================================================================
// PASSWORD HASHING
// ============================================================================

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt || randomBytes(16).toString('hex');
  const hash = createHash('sha256')
    .update(password + useSalt)
    .digest('hex');
  return { hash: `${useSalt}:${hash}`, salt: useSalt };
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  const computed = createHash('sha256')
    .update(password + salt)
    .digest('hex');
  return computed === hash;
}

function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

export async function loginSupplier(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthResult> {
  // Find user
  const { data: user, error: userError } = await supabaseAdmin
    .from('supplier_users')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('is_active', true)
    .single();
    
  if (userError || !user) {
    await logAuditEvent(null, null, 'login_failed', 'supplier_user', null, {
      email,
      reason: 'user_not_found',
    }, ipAddress, userAgent);
    
    return { success: false, error: 'Invalid email or password' };
  }
  
  // Verify password
  if (!verifyPassword(password, user.password_hash)) {
    await logAuditEvent(user.supplier_id, user.id, 'login_failed', 'supplier_user', user.id, {
      reason: 'invalid_password',
    }, ipAddress, userAgent);
    
    return { success: false, error: 'Invalid email or password' };
  }
  
  // Create session
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + AUTH_CONFIG.session_duration_hours * 60 * 60 * 1000);
  
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('supplier_sessions')
    .insert({
      user_id: user.id,
      supplier_id: user.supplier_id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();
    
  if (sessionError) {
    return { success: false, error: 'Failed to create session' };
  }
  
  // Update last login
  await supabaseAdmin
    .from('supplier_users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', user.id);
    
  // Audit log
  await logAuditEvent(user.supplier_id, user.id, 'login_success', 'supplier_user', user.id, {
    session_id: session.id,
  }, ipAddress, userAgent);
  
  return {
    success: true,
    user: {
      id: user.id,
      supplier_id: user.supplier_id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      last_login_at: user.last_login_at,
    },
    session: {
      id: session.id,
      user_id: user.id,
      supplier_id: user.supplier_id,
      token,
      expires_at: session.expires_at,
    },
  };
}

export async function validateSession(token: string): Promise<{
  valid: boolean;
  user?: SupplierUser;
  supplier_id?: string;
}> {
  const tokenHash = hashToken(token);
  
  const { data: session } = await supabaseAdmin
    .from('supplier_sessions')
    .select('*, supplier_users(*)')
    .eq('token_hash', tokenHash)
    .gt('expires_at', new Date().toISOString())
    .single();
    
  if (!session) {
    return { valid: false };
  }
  
  // Update last activity
  await supabaseAdmin
    .from('supplier_sessions')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', session.id);
    
  const userData = session.supplier_users as Record<string, unknown>;
  
  return {
    valid: true,
    user: {
      id: userData.id as string,
      supplier_id: userData.supplier_id as string,
      email: userData.email as string,
      name: userData.name as string,
      role: userData.role as 'admin' | 'editor' | 'viewer',
      is_active: userData.is_active as boolean,
      last_login_at: userData.last_login_at as string | null,
    },
    supplier_id: session.supplier_id,
  };
}

export async function logoutSupplier(
  token: string,
  ipAddress?: string,
  userAgent?: string
): Promise<boolean> {
  const tokenHash = hashToken(token);
  
  // Get session info for audit
  const { data: session } = await supabaseAdmin
    .from('supplier_sessions')
    .select('id, user_id, supplier_id')
    .eq('token_hash', tokenHash)
    .single();
    
  if (session) {
    await logAuditEvent(
      session.supplier_id,
      session.user_id,
      'logout',
      'supplier_session',
      session.id,
      {},
      ipAddress,
      userAgent
    );
  }
  
  const { error } = await supabaseAdmin
    .from('supplier_sessions')
    .delete()
    .eq('token_hash', tokenHash);
    
  return !error;
}

export async function logoutAllSessions(
  supplier_id: string,
  user_id: string
): Promise<number> {
  const { data } = await supabaseAdmin
    .from('supplier_sessions')
    .delete()
    .eq('user_id', user_id)
    .select();
    
  await logAuditEvent(supplier_id, user_id, 'logout_all_sessions', 'supplier_session', null, {
    sessions_terminated: data?.length || 0,
  });
  
  return data?.length || 0;
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

export async function createSupplierUser(
  supplier_id: string,
  email: string,
  password: string,
  name: string,
  role: 'admin' | 'editor' | 'viewer',
  created_by_user_id: string,
  ipAddress?: string
): Promise<{ success: boolean; user?: SupplierUser; error?: string }> {
  // Check if email already exists
  const { data: existing } = await supabaseAdmin
    .from('supplier_users')
    .select('id')
    .eq('email', email.toLowerCase())
    .single();
    
  if (existing) {
    return { success: false, error: 'Email already registered' };
  }
  
  const { hash } = hashPassword(password);
  
  const { data: user, error } = await supabaseAdmin
    .from('supplier_users')
    .insert({
      supplier_id,
      email: email.toLowerCase(),
      password_hash: hash,
      name,
      role,
    })
    .select()
    .single();
    
  if (error) {
    return { success: false, error: 'Failed to create user' };
  }
  
  await logAuditEvent(supplier_id, created_by_user_id, 'create_user', 'supplier_user', user.id, {
    email: user.email,
    role: user.role,
  }, ipAddress);
  
  return {
    success: true,
    user: {
      id: user.id,
      supplier_id: user.supplier_id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      last_login_at: user.last_login_at,
    },
  };
}

export async function updateSupplierPassword(
  user_id: string,
  supplier_id: string,
  old_password: string,
  new_password: string,
  ipAddress?: string
): Promise<{ success: boolean; error?: string }> {
  const { data: user } = await supabaseAdmin
    .from('supplier_users')
    .select('password_hash')
    .eq('id', user_id)
    .eq('supplier_id', supplier_id)
    .single();
    
  if (!user || !verifyPassword(old_password, user.password_hash)) {
    return { success: false, error: 'Current password is incorrect' };
  }
  
  const { hash } = hashPassword(new_password);
  
  const { error } = await supabaseAdmin
    .from('supplier_users')
    .update({ password_hash: hash, updated_at: new Date().toISOString() })
    .eq('id', user_id);
    
  if (error) {
    return { success: false, error: 'Failed to update password' };
  }
  
  await logAuditEvent(supplier_id, user_id, 'password_changed', 'supplier_user', user_id, {}, ipAddress);
  
  // Invalidate all other sessions
  await supabaseAdmin
    .from('supplier_sessions')
    .delete()
    .eq('user_id', user_id);
    
  return { success: true };
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

export async function logAuditEvent(
  supplier_id: string | null,
  user_id: string | null,
  action: string,
  entity_type: string,
  entity_id: string | null,
  changes?: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await supabaseAdmin
    .from('supplier_audit_log')
    .insert({
      supplier_id,
      user_id,
      action,
      entity_type,
      entity_id,
      changes: changes || {},
      ip_address: ipAddress,
      user_agent: userAgent,
    });
}

export async function getAuditLog(
  supplier_id: string,
  limit: number = 50,
  offset: number = 0
): Promise<Array<{
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changes: Record<string, unknown>;
  created_at: string;
  user_name?: string;
}>> {
  const { data } = await supabaseAdmin
    .from('supplier_audit_log')
    .select('*, supplier_users(name)')
    .eq('supplier_id', supplier_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
    
  if (!data) return [];
  
  return data.map(d => ({
    id: d.id,
    action: d.action,
    entity_type: d.entity_type,
    entity_id: d.entity_id,
    changes: d.changes as Record<string, unknown>,
    created_at: d.created_at,
    user_name: (d.supplier_users as { name: string } | null)?.name,
  }));
}

// ============================================================================
// SESSION CLEANUP
// ============================================================================

export async function cleanupExpiredSessions(): Promise<number> {
  const { data } = await supabaseAdmin.rpc('cleanup_expired_supplier_sessions');
  return data || 0;
}
