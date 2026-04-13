/**
 * @anthropic-internal/shared - Rate Limiting
 *
 * Server-side in-memory rate limiter + client-side fetch wrapper with
 * coordinated retry, throttling, and deduplication.
 *
 * Extracted from ClearGo's rate-limit.ts, rate-limit-middleware.ts,
 * and fetch-with-rate-limit.ts.
 */

import type { RateLimitConfig, RateLimitResult, ClientFetchOptions } from '../types';
import { createResponseDeduplicator } from '../deduplication';

// ===========================
// Server-side rate limiter
// ===========================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Creates a server-side in-memory rate limiter.
 * Each instance maintains its own store (useful for per-route or global limiting).
 *
 * For production with multiple instances, swap the store for Redis/Upstash.
 */
export function createRateLimiter() {
  const store = new Map<string, RateLimitEntry>();

  // Auto-cleanup expired entries
  if (typeof setInterval !== 'undefined') {
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of store.entries()) {
        if (entry.resetTime < now) {
          store.delete(key);
        }
      }
    }, 5 * 60 * 1000);
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }
  }

  return {
    /**
     * Check whether a request from `identifier` is allowed under `config`.
     */
    check(
      identifier: string,
      config: RateLimitConfig = { windowMs: 60_000, maxRequests: 60 },
    ): RateLimitResult {
      const now = Date.now();
      const entry = store.get(identifier);

      if (!entry || entry.resetTime < now) {
        const resetTime = now + config.windowMs;
        store.set(identifier, { count: 1, resetTime });
        return { allowed: true, remaining: config.maxRequests - 1, resetTime };
      }

      if (entry.count >= config.maxRequests) {
        return { allowed: false, remaining: 0, resetTime: entry.resetTime };
      }

      entry.count++;
      return { allowed: true, remaining: config.maxRequests - entry.count, resetTime: entry.resetTime };
    },

    /** Clear all entries (useful for testing) */
    clear(): void {
      store.clear();
    },

    /** Current number of tracked identifiers */
    get size(): number {
      return store.size;
    },
  };
}

// ===========================
// Preset rate limit configs
// ===========================

export const RATE_LIMITS = {
  /** 100 req/min — general API endpoints */
  default: { windowMs: 60_000, maxRequests: 100 } satisfies RateLimitConfig,
  /** 40 req/min — expensive operations (reports, exports, AI calls) */
  heavy: { windowMs: 60_000, maxRequests: 40 } satisfies RateLimitConfig,
  /** 200 req/min — cheap reads (settings, feature flags) */
  light: { windowMs: 60_000, maxRequests: 200 } satisfies RateLimitConfig,
} as const;

// ===========================
// Client-side rate-limited fetch
// ===========================

const MAX_CONCURRENT_REQUESTS = 5;

/**
 * Creates a client-side fetch function with:
 * - Automatic 429 retry with exponential backoff
 * - Global rate-limit coordination across parallel requests
 * - Concurrency throttling (max N in-flight requests)
 * - Request deduplication
 */
export function createRateLimitedFetch(options: {
  maxConcurrent?: number;
  defaultCredentials?: RequestCredentials;
} = {}) {
  const maxConcurrent = options.maxConcurrent ?? MAX_CONCURRENT_REQUESTS;
  const defaultCredentials = options.defaultCredentials ?? 'include';

  let globalResetTime: number | null = null;
  let activeCount = 0;
  const queue: Array<() => void> = [];
  const dedup = createResponseDeduplicator();

  function processQueue() {
    while (activeCount < maxConcurrent && queue.length > 0) {
      const next = queue.shift();
      if (next) {
        activeCount++;
        next();
      }
    }
  }

  function acquireSlot(): Promise<void> {
    return new Promise((resolve) => {
      if (activeCount < maxConcurrent) {
        activeCount++;
        resolve();
      } else {
        queue.push(resolve);
      }
    });
  }

  function releaseSlot() {
    activeCount = Math.max(0, activeCount - 1);
    processQueue();
  }

  async function rateLimitedFetch(
    url: string,
    options: ClientFetchOptions = {},
  ): Promise<Response> {
    const { maxRetries = 1, retryDelay = 1000, ...fetchOptions } = options;

    const finalOptions: RequestInit = {
      credentials: defaultCredentials,
      ...fetchOptions,
    };

    const response = await dedup.deduplicate(url, async () => {
      await acquireSlot();
      try {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          const res = await fetch(url, finalOptions);

          if (res.status !== 429 || attempt === maxRetries) {
            return res;
          }

          // Compute wait time
          let waitTime = retryDelay * Math.pow(2, attempt);

          const resetHeader = res.headers.get('X-RateLimit-Reset');
          if (resetHeader) {
            try {
              const resetMs = new Date(resetHeader).getTime();
              const delta = resetMs - Date.now();
              if (delta > 0 && delta < 60_000) {
                waitTime = delta + 100;
                if (!globalResetTime || resetMs > globalResetTime) {
                  globalResetTime = resetMs;
                }
              }
            } catch { /* ignore bad header */ }
          }

          if (globalResetTime) {
            const delta = globalResetTime - Date.now();
            if (delta > 0 && delta < 60_000) waitTime = delta + 100;
          }

          // Jitter to prevent thundering herd
          waitTime += Math.random() * 500;

          console.warn(
            `[RateLimitedFetch] 429 on ${url}, waiting ${Math.round(waitTime)}ms (attempt ${attempt + 1}/${maxRetries + 1})`,
          );

          await new Promise((r) => setTimeout(r, waitTime));
        }

        throw new Error('Max retries exceeded');
      } finally {
        releaseSlot();
      }
    });

    try {
      return response.clone();
    } catch {
      return response;
    }
  }

  /**
   * Batch-fetch multiple URLs with throttling.
   */
  async function batchFetch<_T = unknown>(
    urls: string[],
    options: ClientFetchOptions & { batchSize?: number; batchDelay?: number } = {},
  ): Promise<Array<{ url: string; response: Response | null; error?: Error }>> {
    const { batchSize = 5, batchDelay = 100, ...fetchOpts } = options;
    const results: Array<{ url: string; response: Response | null; error?: Error }> = [];

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (url) => {
          try {
            const response = await rateLimitedFetch(url, fetchOpts);
            return { url, response, error: undefined };
          } catch (error) {
            return { url, response: null, error: error as Error };
          }
        }),
      );
      results.push(...batchResults);

      if (i + batchSize < urls.length) {
        await new Promise((r) => setTimeout(r, batchDelay));
      }
    }

    return results;
  }

  return { fetch: rateLimitedFetch, batchFetch };
}

export type { RateLimitConfig, RateLimitResult, ClientFetchOptions };
