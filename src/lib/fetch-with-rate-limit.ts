/**
 * Client-side utility for making fetch requests with rate limit handling.
 * Respects X-RateLimit-Reset headers and coordinates retries to prevent cascading failures.
 * Includes request queuing, throttling, and deduplication.
 */

import { deduplicateRequest } from './request-deduplication';

interface FetchWithRateLimitOptions extends RequestInit {
  maxRetries?: number;
  retryDelay?: number;
  /** Defaults to `url`. Set when the same URL is used with different POST bodies so dedupe does not merge unrelated calls. */
  dedupeKey?: string;
}

// Shared state to coordinate retries across parallel requests
let globalRateLimitResetTime: number | null = null;
const retryQueue: Array<() => Promise<void>> = [];

// Request throttling: max concurrent requests
const MAX_CONCURRENT_REQUESTS = 5;
let activeRequestCount = 0;
const requestQueue: Array<() => void> = [];

/**
 * Process queued requests when slots become available
 */
function processQueue(): void {
  while (activeRequestCount < MAX_CONCURRENT_REQUESTS && requestQueue.length > 0) {
    const next = requestQueue.shift();
    if (next) {
      activeRequestCount++;
      next();
    }
  }
}

/**
 * Acquire a request slot (throttling)
 */
function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (activeRequestCount < MAX_CONCURRENT_REQUESTS) {
      activeRequestCount++;
      resolve();
    } else {
      requestQueue.push(() => {
        resolve();
      });
    }
  });
}

/**
 * Release a request slot
 */
function releaseSlot(): void {
  activeRequestCount = Math.max(0, activeRequestCount - 1);
  processQueue();
}

/**
 * Fetches a URL with automatic retry on 429 errors, respecting rate limit headers.
 * Coordinates with other parallel requests to prevent cascading retries.
 * Includes request deduplication and throttling.
 */
export async function fetchWithRateLimit(
  url: string,
  options: FetchWithRateLimitOptions = {}
): Promise<Response> {
  const { maxRetries = 1, retryDelay = 1000, dedupeKey, ...fetchOptions } = options;
  const dedupeId = dedupeKey ?? url;

  // Ensure credentials are included for authenticated requests
  const finalOptions: RequestInit = {
    credentials: 'include',
    ...fetchOptions,
  };

  // Use deduplication to prevent duplicate requests
  const response = await deduplicateRequest(dedupeId, async () => {
    // Acquire a request slot (throttling)
    await acquireSlot();
    
    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch(url, finalOptions);
        
        // If not rate limited or last attempt, return immediately
        if (res.status !== 429 || attempt === maxRetries) {
          return res;
        }

        // Handle rate limiting
        const resetHeader = res.headers.get('X-RateLimit-Reset');
        let waitTime = retryDelay * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s

        if (resetHeader) {
          try {
            const resetTime = new Date(resetHeader).getTime();
            const now = Date.now();
            const timeUntilReset = resetTime - now;
            
            // Wait until reset time, but cap at 60 seconds max
            if (timeUntilReset > 0 && timeUntilReset < 60000) {
              waitTime = timeUntilReset + 100; // Add 100ms buffer
              
              // Update global reset time so other parallel requests can coordinate
              if (!globalRateLimitResetTime || resetTime > globalRateLimitResetTime) {
                globalRateLimitResetTime = resetTime;
              }
            }
          } catch (e) {
            console.warn('Failed to parse X-RateLimit-Reset header:', e);
          }
        }

        // If we have a global reset time, use that to coordinate retries
        if (globalRateLimitResetTime) {
          const now = Date.now();
          const timeUntilReset = globalRateLimitResetTime - now;
          if (timeUntilReset > 0 && timeUntilReset < 60000) {
            waitTime = timeUntilReset + 100;
          }
        }

        // Add small random jitter (0-500ms) to prevent thundering herd
        const jitter = Math.random() * 500;
        waitTime += jitter;

        console.warn(
          `Rate limited (429) on ${url}, waiting ${Math.round(waitTime)}ms before retry (attempt ${attempt + 1}/${maxRetries + 1})`
        );

        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      throw new Error('Max retries exceeded');
    } finally {
      // Release the request slot
      releaseSlot();
    }
  });
  
  // Clone the response so each caller can read the body independently
  // This is necessary because deduplication may return the same Response to multiple callers
  try {
    return response.clone();
  } catch (cloneError) {
    // If cloning fails (body already consumed), return the original
    // This should be rare, but handle it gracefully
    return response;
  }
}

/**
 * Batch fetch multiple URLs with rate limit handling and throttling.
 * Processes requests in batches to avoid overwhelming the server.
 */
export async function batchFetchWithRateLimit<T>(
  urls: string[],
  options: FetchWithRateLimitOptions & { batchSize?: number; batchDelay?: number } = {}
): Promise<Array<{ url: string; response: Response | null; error?: Error }>> {
  const { batchSize = 5, batchDelay = 100, ...fetchOptions } = options;
  const results: Array<{ url: string; response: Response | null; error?: Error }> = [];

  // Process URLs in batches
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (url) => {
      try {
        const response = await fetchWithRateLimit(url, fetchOptions);
        // Clone the response so it can be read multiple times
        // If cloning fails (body already consumed), return the original response
        // The caller should read it only once
        try {
          const clonedResponse = response.clone();
          return { url, response: clonedResponse, error: undefined };
        } catch (cloneError) {
          // If clone fails, return original response (caller must read only once)
          return { url, response, error: undefined };
        }
      } catch (error) {
        return { url, response: null, error: error as Error };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Small delay between batches to avoid overwhelming the server
    if (i + batchSize < urls.length) {
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }

  return results;
}

