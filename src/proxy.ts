import { type NextRequest } from 'next/server';
import { updateSession, getUserWithRoles } from '@/lib/supabase/middleware';
import { rateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/welcome', '/auth/callback', '/auth/signout', '/api/auth/signup', '/reset-password', '/setup-password'];

// Routes accessible to users with only the OTHER role (pending access)
const PENDING_ACCESS_ROUTES = ['/access-pending', '/auth/signout', '/account'];

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    
    // Skip proxy for auth callback to avoid interfering with cookie setting
    if (pathname === '/auth/callback') {
        return NextResponse.next();
    }
    
    // Rate limiting for API routes
    if (pathname.startsWith('/api/')) {
        // Exclude high-volume endpoints that are already batched/throttled client-side
        // These endpoints make many requests during page load but are controlled by the client
        const isExcludedFromRateLimit = 
            pathname.includes('/criteria/') && (
                pathname.endsWith('/comments') || 
                pathname.endsWith('/attachments')
            ) ||
            pathname === '/api/debug-log'; // Debug logging endpoint
        
        let rateLimitResult: { allowed: boolean; remaining: number; resetTime: number } | null = null;
        
        if (!isExcludedFromRateLimit) {
            const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
            const identifier = `api:${ip}`;

            rateLimitResult = rateLimit(identifier, {
                windowMs: 60000, // 1 minute
                maxRequests: 100, // 100 requests per minute
            });

            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'proxy.ts:25',message:'Rate limit check',data:{pathname,identifier,allowed:rateLimitResult.allowed,remaining:rateLimitResult.remaining,resetTime:new Date(rateLimitResult.resetTime).toISOString()},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A,B,C'})}).catch(()=>{});
            // #endregion

            if (!rateLimitResult.allowed) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'proxy.ts:30',message:'Rate limit exceeded',data:{pathname,identifier,remaining:rateLimitResult.remaining,resetTime:new Date(rateLimitResult.resetTime).toISOString()},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A,B,C'})}).catch(()=>{});
                // #endregion
                return NextResponse.json(
                    { error: 'Too many requests. Please try again later.' },
                    {
                        status: 429,
                        headers: {
                            'X-RateLimit-Limit': '100',
                            'X-RateLimit-Remaining': '0',
                            'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString(),
                        }
                    }
                );
            }
        }

        // Update session for API routes
        const response = await updateSession(request);
        
        // Only set rate limit headers if rate limiting was applied
        if (rateLimitResult) {
            response.headers.set('X-RateLimit-Limit', '100');
            response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
            response.headers.set('X-RateLimit-Reset', new Date(rateLimitResult.resetTime).toISOString());
        }

        // Apply CORS headers for API routes
        const allowedOrigins = [
            process.env.NGROK_URL,
            'http://localhost:3000',
            'http://127.0.0.1:3000',
        ].filter(Boolean) as string[];

        const origin = request.headers.get('origin');
        if (origin && allowedOrigins.includes(origin)) {
            response.headers.set('Access-Control-Allow-Origin', origin);
            response.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
            response.headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
        }

        return response;
    }

    // Check if route is public
    const isPublicRoute = PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'));
    
    // Update session and check authentication
    const response = await updateSession(request);
    
    // For protected routes, check if user is authenticated
    if (!isPublicRoute) {
        // Check for both Supabase auth cookies AND lr_session cookie
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
        const authCookieName = projectRef ? `sb-${projectRef}-auth-token` : null;
        
        const hasAuthCookie = authCookieName 
            ? request.cookies.has(authCookieName) || request.cookies.has(`${authCookieName}.0`)
            : request.cookies.getAll().some(c => c.name.includes('auth-token'));
        
        const hasLrSession = request.cookies.has('lr_session');
        
        if (!hasAuthCookie && !hasLrSession) {
            // Redirect to login page
            const loginUrl = new URL('/login', request.url);
            loginUrl.searchParams.set('redirect', pathname);
            return NextResponse.redirect(loginUrl);
        }

        // Check if user has only OTHER role (pending access)
        // Skip this check for routes that pending users can access
        const isPendingAccessRoute = PENDING_ACCESS_ROUTES.some(route => 
            pathname === route || pathname.startsWith(route + '/')
        );
        
        if (!isPendingAccessRoute) {
            const userWithRoles = await getUserWithRoles(request);
            if (userWithRoles) {
                const roles = userWithRoles.roles || [];
                // If user has no roles or only has OTHER role, redirect to access-pending
                const hasOnlyOtherRole = roles.length === 0 || 
                    (roles.length === 1 && roles[0] === 'OTHER');
                
                if (hasOnlyOtherRole) {
                    console.log(`[Proxy] Redirecting ${userWithRoles.email} to /access-pending (roles: ${roles.join(', ') || 'none'})`);
                    const accessPendingUrl = new URL('/access-pending', request.url);
                    return NextResponse.redirect(accessPendingUrl);
                }
            }
        }
    }

    // Apply CORS headers
    const allowedOrigins = [
        process.env.NGROK_URL,
        'http://localhost:3000',
        'http://127.0.0.1:3000',
    ].filter(Boolean) as string[];

    const origin = request.headers.get('origin');
    if (origin && allowedOrigins.includes(origin)) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};

