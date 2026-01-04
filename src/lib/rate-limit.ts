// Simple in-memory rate limiter
// For production, consider using Redis or Upstash

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetTime < now) {
            rateLimitStore.delete(key);
        }
    }
}, 5 * 60 * 1000);

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
        // #region agent log
        const fs = require('fs');
        const logEntry = {location:'rate-limit.ts:36',message:'Rate limit new window',data:{identifier,count:1,remaining:config.maxRequests-1,resetTime:new Date(resetTime).toISOString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'};
        try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry) + '\n'); } catch(e) {}
        // #endregion
        return { allowed: true, remaining: config.maxRequests - 1, resetTime };
    }

    if (entry.count >= config.maxRequests) {
        // Rate limit exceeded
        // #region agent log
        const fs = require('fs');
        const logEntry = {location:'rate-limit.ts:42',message:'Rate limit exceeded',data:{identifier,count:entry.count,maxRequests:config.maxRequests,resetTime:new Date(entry.resetTime).toISOString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'};
        try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry) + '\n'); } catch(e) {}
        // #endregion
        return { allowed: false, remaining: 0, resetTime: entry.resetTime };
    }

    // Increment count
    entry.count++;
    // #region agent log
    const fs = require('fs');
    const logEntry = {location:'rate-limit.ts:47',message:'Rate limit increment',data:{identifier,count:entry.count,remaining:config.maxRequests-entry.count,resetTime:new Date(entry.resetTime).toISOString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'};
    try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry) + '\n'); } catch(e) {}
    // #endregion
    return { allowed: true, remaining: config.maxRequests - entry.count, resetTime: entry.resetTime };
}
