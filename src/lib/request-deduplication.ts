/**
 * Request deduplication utility
 * Prevents duplicate requests for the same URL while one is in-flight
 */

interface PendingRequest {
  promise: Promise<Response>;
  timestamp: number;
}

const pendingRequests = new Map<string, PendingRequest>();
const CACHE_TTL_MS = 5000; // 5 seconds - requests expire after this time

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [url, request] of pendingRequests.entries()) {
    if (now - request.timestamp > CACHE_TTL_MS) {
      pendingRequests.delete(url);
    }
  }
}, 10000); // Clean up every 10 seconds

/**
 * Get or create a fetch request, deduplicating in-flight requests
 * 
 * @param url - The URL to fetch
 * @param fetchFn - The fetch function to use
 * @returns The response promise (shared if request is in-flight)
 */
export function deduplicateRequest(
  url: string,
  fetchFn: () => Promise<Response>
): Promise<Response> {
  const now = Date.now();
  const existing = pendingRequests.get(url);
  
  // If there's an existing request that's still fresh, return it
  if (existing && (now - existing.timestamp) < CACHE_TTL_MS) {
    return existing.promise;
  }
  
  // Create new request
  const promise = fetchFn().finally(() => {
    // Remove from cache after request completes (with a small delay to allow immediate retries)
    setTimeout(() => {
      pendingRequests.delete(url);
    }, 100);
  });
  
  pendingRequests.set(url, { promise, timestamp: now });
  return promise;
}

/**
 * Clear all pending requests (useful for testing or cleanup)
 */
export function clearPendingRequests(): void {
  pendingRequests.clear();
}
