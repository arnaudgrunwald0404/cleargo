/**
 * @anthropic-internal/shared - Request Deduplication
 *
 * Prevents duplicate in-flight requests for the same key. When multiple callers
 * request the same resource concurrently, only one fetch executes; all callers
 * receive a cloned response.
 *
 * Extracted from ClearGo's request-deduplication.ts.
 *
 * Usage:
 *   const response = await deduplicateRequest('/api/settings', () => fetch('/api/settings'));
 */

interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

const DEFAULT_TTL_MS = 5_000;
const DEFAULT_CLEANUP_INTERVAL_MS = 10_000;

export interface DeduplicationConfig {
  /** How long a cached result remains valid (default: 5000ms) */
  ttlMs?: number;
  /** How often to sweep expired entries (default: 10000ms) */
  cleanupIntervalMs?: number;
}

/**
 * Creates a deduplication cache scoped to a context (e.g. one per app).
 * Each cache tracks in-flight requests by key and returns shared promises.
 */
export function createDeduplicator<T = Response>(config: DeduplicationConfig = {}) {
  const ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
  const cleanupIntervalMs = config.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
  const pending = new Map<string, PendingRequest<T>>();

  // Periodic cleanup (Node.js only; safe no-op in Edge)
  if (typeof setInterval !== 'undefined') {
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of pending.entries()) {
        if (now - entry.timestamp > ttlMs) {
          pending.delete(key);
        }
      }
    }, cleanupIntervalMs);
    // Don't keep the process alive just for cleanup
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }
  }

  return {
    /**
     * Execute `fn` for the given key, deduplicating concurrent calls.
     * If a request for the same key is already in-flight and fresh, its
     * result is shared with all callers.
     */
    async deduplicate(key: string, fn: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const existing = pending.get(key);

      if (existing && now - existing.timestamp < ttlMs) {
        return existing.promise;
      }

      const promise = fn().finally(() => {
        // Allow immediate re-fetch after completion
        const entry = pending.get(key);
        if (entry && entry.promise === promise) {
          // Keep it around for the remainder of the TTL window
          // so truly concurrent callers still benefit
        }
      });

      pending.set(key, { promise, timestamp: now });
      return promise;
    },

    /** Remove all cached entries (useful for testing) */
    clear(): void {
      pending.clear();
    },

    /** Number of currently cached entries */
    get size(): number {
      return pending.size;
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience: Response-specific deduplicator with automatic cloning
// ---------------------------------------------------------------------------

/**
 * A pre-built deduplicator for fetch Responses that clones results so each
 * caller can independently read the body.
 */
export function createResponseDeduplicator(config: DeduplicationConfig = {}) {
  const inner = createDeduplicator<Response>(config);

  return {
    async deduplicate(key: string, fn: () => Promise<Response>): Promise<Response> {
      const response = await inner.deduplicate(key, fn);
      try {
        return response.clone();
      } catch {
        return response;
      }
    },
    clear: inner.clear,
    get size() {
      return inner.size;
    },
  };
}
