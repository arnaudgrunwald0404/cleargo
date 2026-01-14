import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RateLimitConfig } from '@/lib/rate-limit';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';

/**
 * Rate limit configuration for different endpoint types
 */
export const RATE_LIMITS = {
  default: { windowMs: 60000, maxRequests: 100 },
  heavy: { windowMs: 60000, maxRequests: 40 }, // For expensive operations
  light: { windowMs: 60000, maxRequests: 200 }, // For simple reads
};

/**
 * Creates a rate-limited API route handler wrapper
 * 
 * @param handler - The API route handler function
 * @param config - Rate limit configuration (defaults to RATE_LIMITS.default)
 * @param identifierFn - Optional function to generate rate limit identifier (defaults to user email)
 * @returns Wrapped handler with rate limiting applied
 */
export function withRateLimit<T = any>(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse<T>>,
  config: RateLimitConfig = RATE_LIMITS.default,
  identifierFn?: (req: NextRequest) => Promise<string> | string
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse<T>> => {
    // Get identifier for rate limiting (user email by default)
    let identifier: string;
    if (identifierFn) {
      identifier = await Promise.resolve(identifierFn(req));
    } else {
      const userEmail = await getAuthenticatedUserEmail();
      identifier = userEmail || req.ip || 'anonymous';
    }

    // Check rate limit
    const { allowed, remaining, resetTime } = rateLimit(identifier, config);

    // Create headers with rate limit info
    const headers = new Headers();
    headers.set('X-RateLimit-Limit', config.maxRequests.toString());
    headers.set('X-RateLimit-Remaining', remaining.toString());
    headers.set('X-RateLimit-Reset', new Date(resetTime).toISOString());

    if (!allowed) {
      return NextResponse.json(
        { 
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
        },
        { 
          status: 429,
          headers 
        }
      );
    }

    // Execute the handler
    try {
      const response = await handler(req, context);
      
      // Add rate limit headers to successful response
      response.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
      response.headers.set('X-RateLimit-Remaining', remaining.toString());
      response.headers.set('X-RateLimit-Reset', new Date(resetTime).toISOString());
      
      return response;
    } catch (error) {
      // Add rate limit headers even to error responses
      const errorResponse = NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500, headers }
      );
      return errorResponse as NextResponse<T>;
    }
  };
}
