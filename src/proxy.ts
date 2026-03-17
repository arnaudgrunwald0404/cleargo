import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { rateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

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
                maxRequests: 300, // 300 requests per minute (dashboard loads trigger 30+ parallel calls)
            });

            if (!rateLimitResult.allowed) {
                return NextResponse.json(
                    { error: 'Too many requests. Please try again later.' },
                    {
                        status: 429,
                        headers: {
                            'X-RateLimit-Limit': '300',
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
            response.headers.set('X-RateLimit-Limit', '300');
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

    // Update session and check authentication
    const response = await updateSession(request);
    
    // Auth redirect is handled by server-rendered pages (e.g. page.tsx, epics/page.tsx), not here.
    // Redirecting in Edge middleware can cause ERR_TOO_MANY_REDIRECTS on Netlify when the Edge
    // runtime doesn't see the same cookies as the Node server.

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
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ico|pdf)$).*)',
    ],
};

