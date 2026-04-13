/**
 * @anthropic-internal/shared - Next.js API Middleware Framework
 *
 * Composable higher-order functions for Next.js API route handlers.
 * Provides rate limiting, auth guards, error handling, and CORS.
 *
 * Extracted from ClearGo's rate-limit-middleware.ts and api-auth.ts.
 *
 * Usage:
 *   // Compose middleware for an API route
 *   const handler = pipe(
 *     withErrorHandler(),
 *     withRateLimit(limiter, RATE_LIMITS.default),
 *     withAuth(getEmail),
 *   )(async (req, ctx) => {
 *     return NextResponse.json({ ok: true });
 *   });
 *
 *   export const GET = handler;
 */

import type { RateLimitConfig } from '../types';
import { createRateLimiter } from '../rate-limiting';

// ---------------------------------------------------------------------------
// Types for Next.js compatibility (avoids hard dependency on next)
// ---------------------------------------------------------------------------

/** Minimal request shape compatible with NextRequest */
interface MinimalRequest {
  headers: { get(name: string): string | null };
  url: string;
  method: string;
}

/** Minimal response shape compatible with NextResponse */
interface MinimalResponse {
  headers: { set(name: string, value: string): void };
  status?: number;
}

type RouteHandler<TReq = MinimalRequest, TRes = MinimalResponse> = (
  req: TReq,
  context?: unknown,
) => Promise<TRes>;

type Middleware<TReq = MinimalRequest, TRes = MinimalResponse> = (
  handler: RouteHandler<TReq, TRes>,
) => RouteHandler<TReq, TRes>;

// ---------------------------------------------------------------------------
// JSON response helper (framework-agnostic)
// ---------------------------------------------------------------------------

interface JsonResponseInit {
  status?: number;
  headers?: Record<string, string>;
}

/**
 * Generic JSON response factory. Override this if your framework uses
 * something other than the standard Response constructor.
 */
export let createJsonResponse = (body: unknown, init?: JsonResponseInit): MinimalResponse => {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (init?.headers) {
    Object.entries(init.headers).forEach(([k, v]) => headers.set(k, v));
  }
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers,
  }) as unknown as MinimalResponse;
};

/**
 * Override the JSON response factory (e.g. to use NextResponse.json).
 */
export function setJsonResponseFactory(
  factory: (body: unknown, init?: JsonResponseInit) => MinimalResponse,
) {
  createJsonResponse = factory;
}

// ---------------------------------------------------------------------------
// withRateLimit
// ---------------------------------------------------------------------------

/**
 * Rate-limit middleware for API routes.
 *
 * @param limiter - A rate limiter instance from createRateLimiter()
 * @param config - Rate limit window and max requests
 * @param identifierFn - Extracts the rate limit key from the request (default: IP)
 */
export function withRateLimit<TReq extends MinimalRequest = MinimalRequest>(
  limiter: ReturnType<typeof createRateLimiter>,
  config: RateLimitConfig,
  identifierFn?: (req: TReq) => Promise<string> | string,
): Middleware<TReq> {
  return (handler) => async (req, context) => {
    const identifier = identifierFn
      ? await Promise.resolve(identifierFn(req))
      : req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'anonymous';

    const { allowed, remaining, resetTime } = limiter.check(identifier, config);

    const rateLimitHeaders: Record<string, string> = {
      'X-RateLimit-Limit': config.maxRequests.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': new Date(resetTime).toISOString(),
    };

    if (!allowed) {
      return createJsonResponse(
        {
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
        },
        { status: 429, headers: rateLimitHeaders },
      ) as any;
    }

    const response = await handler(req, context);

    // Attach rate limit headers to successful response
    Object.entries(rateLimitHeaders).forEach(([k, v]) => {
      response.headers.set(k, v);
    });

    return response;
  };
}

// ---------------------------------------------------------------------------
// withAuth
// ---------------------------------------------------------------------------

/**
 * Auth guard middleware. Rejects unauthenticated requests with 401.
 *
 * @param getEmail - Async function that extracts the authenticated user's email
 *                   from the request. Return null if unauthenticated.
 */
export function withAuth<TReq extends MinimalRequest = MinimalRequest>(
  getEmail: (req: TReq) => Promise<string | null>,
): Middleware<TReq> {
  return (handler) => async (req, context) => {
    const email = await getEmail(req);
    if (!email) {
      return createJsonResponse(
        { error: 'Unauthorized' },
        { status: 401 },
      ) as any;
    }
    return handler(req, context);
  };
}

// ---------------------------------------------------------------------------
// withErrorHandler
// ---------------------------------------------------------------------------

/**
 * Wraps a handler with try-catch, returning a consistent error response shape.
 */
export function withErrorHandler<TReq extends MinimalRequest = MinimalRequest>(): Middleware<TReq> {
  return (handler) => async (req, context) => {
    try {
      return await handler(req, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal Server Error';
      console.error(`[API Error] ${req.method} ${req.url}:`, error);
      return createJsonResponse(
        { error: message, code: 'INTERNAL_ERROR' },
        { status: 500 },
      ) as any;
    }
  };
}

// ---------------------------------------------------------------------------
// withCors
// ---------------------------------------------------------------------------

export interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  maxAge?: number;
}

/**
 * CORS middleware. Handles preflight OPTIONS and sets CORS headers.
 */
export function withCors<TReq extends MinimalRequest = MinimalRequest>(
  config: CorsConfig,
): Middleware<TReq> {
  const methods = config.allowedMethods ?? ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
  const headers = config.allowedHeaders ?? ['Content-Type', 'Authorization'];
  const maxAge = config.maxAge ?? 86400;

  return (handler) => async (req, context) => {
    const origin = req.headers.get('origin') || '';
    const isAllowed = config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin);

    // Preflight
    if (req.method === 'OPTIONS') {
      const preflightHeaders: Record<string, string> = {};
      if (isAllowed) {
        preflightHeaders['Access-Control-Allow-Origin'] = origin || '*';
        preflightHeaders['Access-Control-Allow-Methods'] = methods.join(', ');
        preflightHeaders['Access-Control-Allow-Headers'] = headers.join(', ');
        preflightHeaders['Access-Control-Max-Age'] = maxAge.toString();
      }
      return createJsonResponse(null, { status: 204, headers: preflightHeaders }) as any;
    }

    const response = await handler(req, context);

    if (isAllowed) {
      response.headers.set('Access-Control-Allow-Origin', origin || '*');
      response.headers.set('Access-Control-Allow-Methods', methods.join(', '));
      response.headers.set('Access-Control-Allow-Headers', headers.join(', '));
    }

    return response;
  };
}

// ---------------------------------------------------------------------------
// withCronAuth
// ---------------------------------------------------------------------------

/**
 * Cron job auth middleware. Validates Bearer token against CRON_SECRET.
 * Use for background job endpoints triggered by GitHub Actions / external cron.
 */
export function withCronAuth<TReq extends MinimalRequest = MinimalRequest>(
  secret: string | undefined,
): Middleware<TReq> {
  return (handler) => async (req, context) => {
    if (secret) {
      const authHeader = req.headers.get('authorization');
      if (authHeader !== `Bearer ${secret}`) {
        return createJsonResponse({ error: 'Unauthorized' }, { status: 401 }) as any;
      }
    }
    return handler(req, context);
  };
}

// ---------------------------------------------------------------------------
// pipe — compose middleware from left to right
// ---------------------------------------------------------------------------

/**
 * Compose multiple middleware into a single wrapper.
 * Applies left-to-right: the first middleware is the outermost.
 *
 *   pipe(withErrorHandler(), withRateLimit(limiter, config))(handler)
 *   // equivalent to: withErrorHandler()(withRateLimit(limiter, config)(handler))
 */
export function pipe<TReq extends MinimalRequest = MinimalRequest, TRes extends MinimalResponse = MinimalResponse>(
  ...middlewares: Middleware<TReq, TRes>[]
): (handler: RouteHandler<TReq, TRes>) => RouteHandler<TReq, TRes> {
  return (handler) =>
    middlewares.reduceRight(
      (acc, mw) => mw(acc),
      handler,
    );
}
