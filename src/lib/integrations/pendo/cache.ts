/**
 * Pendo API Cache
 *
 * Supabase-backed cache for Pendo API responses.
 * Works across all Netlify serverless invocations and all users.
 *
 * TTL defaults:
 *   events   – 1 hour
 *   features – 1 hour
 *   segments – 4 hours
 */

import { createClient } from '@/lib/supabase/server';

// Default TTLs in seconds
export const PENDO_CACHE_TTL = {
  events: 3600,       // 1 hour
  features: 3600,     // 1 hour
  pages: 3600,        // 1 hour
  segments: 14400,    // 4 hours
} as const;

interface CacheRow {
  cache_key: string;
  data: unknown;
  cached_at: string;
  ttl_seconds: number;
}

/**
 * Build a deterministic cache key from the endpoint type and query params.
 * e.g. "pendo:events:activeOnly=false&days=3"
 */
export function buildCacheKey(
  type: 'events' | 'features' | 'pages' | 'segments',
  params?: Record<string, string | null | undefined>,
): string {
  const parts = [`pendo:${type}`];
  if (params) {
    const sorted = Object.entries(params)
      .filter(([, v]) => v != null && v !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    if (sorted) parts.push(sorted);
  }
  return parts.join(':');
}

/**
 * Get cached data if it exists and hasn't expired.
 * Returns `null` if the cache is stale or missing.
 */
export async function getCachedPendoResponse<T = unknown>(
  cacheKey: string,
): Promise<T | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('pendo_api_cache')
      .select('data, cached_at, ttl_seconds')
      .eq('cache_key', cacheKey)
      .single();

    if (error || !data) return null;

    const row = data as CacheRow;
    const cachedAt = new Date(row.cached_at).getTime();
    const expiresAt = cachedAt + row.ttl_seconds * 1000;

    if (Date.now() > expiresAt) {
      // Expired – don't delete, just return null so the caller can refresh
      console.log(`[PendoCache] MISS (expired) key=${cacheKey}`);
      return null;
    }

    console.log(`[PendoCache] HIT key=${cacheKey}, age=${Math.round((Date.now() - cachedAt) / 1000)}s`);
    return row.data as T;
  } catch (err) {
    console.warn('[PendoCache] Error reading cache, will fetch fresh:', err);
    return null;
  }
}

/**
 * Store data in the cache with the specified TTL.
 * Uses upsert so re-fetches just overwrite the old row.
 */
export async function setCachedPendoResponse(
  cacheKey: string,
  data: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from('pendo_api_cache')
      .upsert(
        {
          cache_key: cacheKey,
          data,
          cached_at: new Date().toISOString(),
          ttl_seconds: ttlSeconds,
        },
        { onConflict: 'cache_key' },
      );

    if (error) {
      // Non-fatal – worst case we just skip caching
      console.warn('[PendoCache] Error writing cache:', error.message);
    } else {
      console.log(`[PendoCache] SET key=${cacheKey}, ttl=${ttlSeconds}s`);
    }
  } catch (err) {
    console.warn('[PendoCache] Error writing cache:', err);
  }
}

/**
 * Invalidate a specific cache key (or all Pendo caches if no key given).
 */
export async function invalidatePendoCache(cacheKey?: string): Promise<void> {
  try {
    const supabase = createClient();
    if (cacheKey) {
      await supabase.from('pendo_api_cache').delete().eq('cache_key', cacheKey);
    } else {
      await supabase.from('pendo_api_cache').delete().like('cache_key', 'pendo:%');
    }
    console.log(`[PendoCache] INVALIDATED ${cacheKey || 'all pendo keys'}`);
  } catch (err) {
    console.warn('[PendoCache] Error invalidating cache:', err);
  }
}

/**
 * Helper: get-or-fetch pattern.
 * Returns cached value if valid, otherwise calls `fetchFn`, caches the result, and returns it.
 * Pass `forceRefresh: true` to bypass the cache.
 */
export async function getOrFetchPendo<T>(opts: {
  cacheKey: string;
  ttlSeconds: number;
  forceRefresh?: boolean;
  fetchFn: () => Promise<T>;
}): Promise<{ data: T; fromCache: boolean }> {
  const { cacheKey, ttlSeconds, forceRefresh, fetchFn } = opts;

  if (!forceRefresh) {
    const cached = await getCachedPendoResponse<T>(cacheKey);
    if (cached !== null) {
      return { data: cached, fromCache: true };
    }
  }

  // Fetch fresh data
  const data = await fetchFn();

  // Cache in background – don't block the response
  setCachedPendoResponse(cacheKey, data, ttlSeconds).catch(() => {});

  return { data, fromCache: false };
}
