/**
 * Supplier Portal Authentication API
 * 
 * Security features:
 * - Rate limiting on login attempts
 * - Secure cookie flags (HttpOnly, Secure, SameSite=strict)
 * - Authentication failure telemetry
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  loginSupplier, 
  validateSession, 
  logoutSupplier,
} from '@/lib/supplier-portal';
import { 
  checkRateLimit, 
  recordFailedLogin, 
  clearRateLimit,
  RATE_LIMIT_CONFIGS 
} from '@/lib/hardening/rateLimiter';
import { logAuthenticationFailure } from '@/lib/hardening/telemetry';

// Secure cookie configuration
const SECURE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/supplier-portal',
  maxAge: 24 * 60 * 60, // 24 hours
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    switch (action) {
      case 'login': {
        const { email, password } = body;
        
        if (!email || !password) {
          return NextResponse.json(
            { error: 'Email and password required' },
            { status: 400 }
          );
        }
        
        // Check rate limit by IP
        const ipRateLimit = await checkRateLimit(`ip:${ipAddress}`, RATE_LIMIT_CONFIGS.login);
        if (!ipRateLimit.allowed) {
          await logAuthenticationFailure('Rate limit exceeded', {
            ip_address: ipAddress,
            user_agent: userAgent,
            auth_type: 'supplier',
            failure_reason: 'rate_limited',
          });
          
          return NextResponse.json(
            { 
              error: 'Too many login attempts. Please try again later.',
              retry_after: Math.ceil((ipRateLimit.blocked_until!.getTime() - Date.now()) / 1000),
            },
            { 
              status: 429,
              headers: {
                'Retry-After': String(Math.ceil((ipRateLimit.blocked_until!.getTime() - Date.now()) / 1000)),
              },
            }
          );
        }
        
        // Check rate limit by email
        const emailRateLimit = await checkRateLimit(`email:${email.toLowerCase()}`, RATE_LIMIT_CONFIGS.login);
        if (!emailRateLimit.allowed) {
          return NextResponse.json(
            { 
              error: 'Too many login attempts for this account. Please try again later.',
              retry_after: Math.ceil((emailRateLimit.blocked_until!.getTime() - Date.now()) / 1000),
            },
            { 
              status: 429,
              headers: {
                'Retry-After': String(Math.ceil((emailRateLimit.blocked_until!.getTime() - Date.now()) / 1000)),
              },
            }
          );
        }
        
        const result = await loginSupplier(email, password, ipAddress, userAgent);
        
        if (!result.success) {
          // Record failed login (increases rate limit impact)
          await recordFailedLogin(ipAddress, email);
          
          await logAuthenticationFailure('Login failed', {
            email,
            ip_address: ipAddress,
            user_agent: userAgent,
            auth_type: 'supplier',
            failure_reason: result.error,
          });
          
          return NextResponse.json(
            { error: result.error },
            { status: 401 }
          );
        }
        
        // Clear rate limit on successful login
        await clearRateLimit(`ip:${ipAddress}`);
        await clearRateLimit(`email:${email.toLowerCase()}`);
        
        // Set session cookie with secure flags
        const response = NextResponse.json({
          success: true,
          user: result.user,
        });
        
        response.cookies.set('supplier_session', result.session!.token, SECURE_COOKIE_OPTIONS);
        
        return response;
      }
      
      case 'logout': {
        const token = request.cookies.get('supplier_session')?.value;
        
        if (token) {
          await logoutSupplier(token, ipAddress, userAgent);
        }
        
        const response = NextResponse.json({ success: true });
        response.cookies.delete('supplier_session');
        return response;
      }
      
      case 'validate': {
        const token = request.cookies.get('supplier_session')?.value;
        
        if (!token) {
          return NextResponse.json(
            { valid: false },
            { status: 401 }
          );
        }
        
        const result = await validateSession(token);
        
        if (!result.valid) {
          const response = NextResponse.json(
            { valid: false },
            { status: 401 }
          );
          response.cookies.delete('supplier_session');
          return response;
        }
        
        return NextResponse.json({
          valid: true,
          user: result.user,
        });
      }
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Auth API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
