/**
 * Request deduplication utility
 * Prevents duplicate requests for the same URL while one is in-flight
 */

interface PendingRequest {
  promise: Promise<Response>;
  timestamp: number;
  isCompleted: boolean;
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
  
  // If there's an existing request that's still fresh, return a cloned response
  if (existing && (now - existing.timestamp) < CACHE_TTL_MS) {
    // Clone the response so multiple callers can read it independently
    return existing.promise.then(response => response.clone());
  }
  
  // Create new request - clone response so multiple callers can read it
  const promise = fetchFn()
    .then(response => {
      // Mark as completed
      const entry = pendingRequests.get(url);
      if (entry) {
        entry.isCompleted = true;
      }
      // Clone response so it can be read multiple times
      return response.clone();
    });
  
  pendingRequests.set(url, { promise, timestamp: now, isCompleted: false });
  return promise;
}

/**
 * Clear all pending requests (useful for testing or cleanup)
 */
export function clearPendingRequests(): void {
  pendingRequests.clear();
}
