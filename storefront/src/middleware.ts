/**
 * Middleware for route protection
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin routes require authentication
  if (pathname.startsWith('/admin')) {
    // In development, allow access without auth for convenience
    if (process.env.NODE_ENV === 'development') {
      const devBypass = request.headers.get('x-admin-bypass');
      if (devBypass === 'true') {
        return NextResponse.next();
      }
      // Allow dev access without strict auth
      return NextResponse.next();
    }

    // Check for admin secret header (for API access)
    const adminSecret = process.env.ADMIN_SECRET;
    if (adminSecret) {
      const authHeader = request.headers.get('authorization');
      if (authHeader === `Bearer ${adminSecret}`) {
        return NextResponse.next();
      }
    }

    // Check Supabase session
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase env vars for middleware');
      return NextResponse.redirect(new URL('/login?error=config', request.url));
    }

    const response = NextResponse.next();

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // Optional: Check for admin role in user metadata
    const isAdmin = user.user_metadata?.role === 'admin' || 
                    user.email?.endsWith('@glovecubs.com');
    
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    return response;
  }

  // Internal API routes require secrets
  if (pathname.startsWith('/api/internal')) {
    const cronSecret = process.env.CRON_SECRET;
    const workerSecret = process.env.WORKER_SECRET || cronSecret;
    
    // In development, allow without auth
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.next();
    }

    const authHeader = request.headers.get('authorization');
    const isValid = authHeader === `Bearer ${cronSecret}` || 
                    authHeader === `Bearer ${workerSecret}`;

    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/internal/:path*',
  ],
};
