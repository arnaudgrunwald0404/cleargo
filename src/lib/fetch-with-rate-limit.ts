/**
 * Client-side utility for making fetch requests with rate limit handling.
 * Respects X-RateLimit-Reset headers and coordinates retries to prevent cascading failures.
 */

interface FetchWithRateLimitOptions extends RequestInit {
  maxRetries?: number;
  retryDelay?: number;
}

// Shared state to coordinate retries across parallel requests
let globalRateLimitResetTime: number | null = null;
let retryQueue: Array<() => Promise<void>> = [];

/**
 * Fetches a URL with automatic retry on 429 errors, respecting rate limit headers.
 * Coordinates with other parallel requests to prevent cascading retries.
 */
export async function fetchWithRateLimit(
  url: string,
  options: FetchWithRateLimitOptions = {}
): Promise<Response> {
  const { maxRetries = 1, retryDelay = 1000, ...fetchOptions } = options;
  
  // Ensure credentials are included for authenticated requests
  const finalOptions: RequestInit = {
    credentials: 'include',
    ...fetchOptions,
  };

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
        return { url, response, error: undefined };
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

