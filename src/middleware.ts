import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { rateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
    // Rate limiting for API routes
    if (request.nextUrl.pathname.startsWith('/api/')) {
        const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
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

        // If allowed, proceed with session update and CORS
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

    // For non-API routes, just handle auth and CORS as before
    const response = await updateSession(request);

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
