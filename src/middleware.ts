import { type NextRequest } from 'next/server';
import { updateSession, getUserWithRoles } from '@/lib/supabase/middleware';
import { rateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/auth/signout', '/api/auth/signup'];

// Routes accessible to users with only the OTHER role (pending access)
const PENDING_ACCESS_ROUTES = ['/access-pending', '/auth/signout', '/account'];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    
    // Skip middleware for auth callback to avoid interfering with cookie setting
    if (pathname === '/auth/callback') {
        return NextResponse.next();
    }
    
    // Rate limiting for API routes
    if (pathname.startsWith('/api/')) {
        const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
        const identifier = `api:${ip}`;

        const { allowed, remaining, resetTime } = rateLimit(identifier, {
            windowMs: 60000, // 1 minute
            maxRequests: 100, // 100 requests per minute
        });

        if (!allowed) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Limit': '100',
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': new Date(resetTime).toISOString(),
                    }
                }
            );
        }

        // Update session for API routes
        const response = await updateSession(request);
        response.headers.set('X-RateLimit-Limit', '100');
        response.headers.set('X-RateLimit-Remaining', remaining.toString());
        response.headers.set('X-RateLimit-Reset', new Date(resetTime).toISOString());

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
        // Check for Supabase auth cookies
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
        const authCookieName = projectRef ? `sb-${projectRef}-auth-token` : null;
        
        // Look for auth token in cookies
        const hasAuthCookie = authCookieName 
            ? request.cookies.has(authCookieName) || request.cookies.has(`${authCookieName}.0`)
            : request.cookies.getAll().some(c => c.name.includes('auth-token'));
        
        if (!hasAuthCookie) {
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
            console.log('🔐 Middleware - Checking roles for protected route:', pathname);
            const userWithRoles = await getUserWithRoles(request);
            console.log('🔐 Middleware - userWithRoles:', userWithRoles);
            if (userWithRoles) {
                const roles = userWithRoles.roles || [];
                // If user has no roles or only has OTHER role, redirect to access-pending
                const hasOnlyOtherRole = roles.length === 0 || 
                    (roles.length === 1 && roles[0] === 'OTHER');
                
                console.log('🔐 Middleware - roles:', roles, 'hasOnlyOtherRole:', hasOnlyOtherRole);
                
                if (hasOnlyOtherRole) {
                    console.log('🔐 Middleware - Redirecting to /access-pending');
                    const accessPendingUrl = new URL('/access-pending', request.url);
                    return NextResponse.redirect(accessPendingUrl);
                }
                
                console.log('✅ Middleware - User has valid roles, allowing access');
            }
        } else {
            console.log('🔐 Middleware - Skipping role check for pending access route:', pathname);
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
