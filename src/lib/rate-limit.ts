// Simple in-memory rate limiter
// For production, consider using Redis or Upstash

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes (Node only; Edge has no setInterval or per-instance store)
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of rateLimitStore.entries()) {
            if (entry.resetTime < now) {
                rateLimitStore.delete(key);
            }
        }
    }, 5 * 60 * 1000);
}

export interface RateLimitConfig {
    windowMs: number; // Time window in milliseconds
    maxRequests: number; // Max requests per window
}

export function rateLimit(
    identifier: string,
    config: RateLimitConfig = { windowMs: 60000, maxRequests: 60 }
): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const entry = rateLimitStore.get(identifier);

    if (!entry || entry.resetTime < now) {
        // New window
        const resetTime = now + config.windowMs;
        rateLimitStore.set(identifier, { count: 1, resetTime });
        return { allowed: true, remaining: config.maxRequests - 1, resetTime };
    }

    if (entry.count >= config.maxRequests) {
        // Rate limit exceeded
        return { allowed: false, remaining: 0, resetTime: entry.resetTime };
    }

    // Increment count
    entry.count++;
    return { allowed: true, remaining: config.maxRequests - entry.count, resetTime: entry.resetTime };
}

/**
 * Clear all rate limit entries (useful for testing)
 */
export function clearRateLimitStore(): void {
    rateLimitStore.clear();
}

/**
 * Get current rate limit statistics for monitoring
 * Returns active rate limit entries with their current counts
 */
export function getRateLimitStats(): Array<{
    identifier: string;
    count: number;
    remaining: number;
    resetTime: number;
    maxRequests: number;
}> {
    const now = Date.now();
    return Array.from(rateLimitStore.entries())
        .filter(([_, entry]) => entry.resetTime >= now)
        .map(([identifier, entry]) => {
            // Determine maxRequests from the entry (we'll need to track this)
            // For now, assume default of 100 (from proxy.ts)
            const maxRequests = 100;
            return {
                identifier,
                count: entry.count,
                remaining: Math.max(0, maxRequests - entry.count),
                resetTime: entry.resetTime,
                maxRequests
            };
        });
}
