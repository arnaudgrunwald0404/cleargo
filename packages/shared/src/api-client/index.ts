/**
 * @anthropic-internal/shared - Generic API Client
 *
 * A typed HTTP client with exponential backoff retry, timeout, and error
 * classification. Extracted from ClearGo's Aha/Slack/Jira integration clients.
 *
 * Usage:
 *   const aha = createApiClient({
 *     baseUrl: 'https://company.aha.io/api/v1',
 *     defaultHeaders: { Authorization: `Bearer ${token}` },
 *     retry: { maxRetries: 3 },
 *   });
 *   const epics = await aha.get<Epic[]>('/epics');
 */

import { ApiClientConfig, ApiError, RetryOptions } from '../types';

const DEFAULT_RETRY: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10_000,
  jitterMs: 500,
  retryableStatuses: [429, 500, 502, 503, 504],
};

const DEFAULT_TIMEOUT_MS = 30_000;

function isRetryable(status: number, retryable: number[]): boolean {
  return retryable.includes(status);
}

function computeDelay(attempt: number, opts: Required<RetryOptions>): number {
  const exponential = opts.initialDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, opts.maxDelayMs);
  const jitter = Math.random() * opts.jitterMs;
  return capped + jitter;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface ApiClient {
  get<T = unknown>(path: string, init?: RequestInit): Promise<T>;
  post<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  put<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  delete<T = unknown>(path: string, init?: RequestInit): Promise<T>;
  /** Raw fetch with retry — returns the Response object */
  request(path: string, init?: RequestInit): Promise<Response>;
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const retryOpts: Required<RetryOptions> = { ...DEFAULT_RETRY, ...config.retry };
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${config.baseUrl}${path}`;

    let requestInit: RequestInit = {
      ...init,
      headers: {
        ...config.defaultHeaders,
        ...init.headers,
      },
    };

    if (config.onBeforeRequest) {
      requestInit = await config.onBeforeRequest(url, requestInit);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryOpts.maxRetries; attempt++) {
      try {
        const response = await fetchWithTimeout(url, requestInit, timeoutMs);

        if (response.ok) {
          return response;
        }

        // Non-retryable client error (4xx except 429)
        if (!isRetryable(response.status, retryOpts.retryableStatuses)) {
          let body: unknown;
          try {
            body = await response.json();
          } catch {
            body = await response.text().catch(() => undefined);
          }
          const error = new ApiError(
            `${response.status} ${response.statusText}: ${url}`,
            response.status,
            url,
            body,
          );
          config.onError?.(error);
          throw error;
        }

        // Retryable — wait and try again
        if (attempt < retryOpts.maxRetries) {
          let delay = computeDelay(attempt, retryOpts);

          // Respect Retry-After or X-RateLimit-Reset headers on 429
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const rateLimitReset = response.headers.get('X-RateLimit-Reset');
            if (retryAfter) {
              const seconds = parseInt(retryAfter, 10);
              if (!isNaN(seconds)) delay = seconds * 1000;
            } else if (rateLimitReset) {
              const resetTime = new Date(rateLimitReset).getTime();
              const waitMs = resetTime - Date.now();
              if (waitMs > 0 && waitMs < 60_000) delay = waitMs + 100;
            }
          }

          console.warn(
            `[ApiClient] ${response.status} on ${url}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${retryOpts.maxRetries})`,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        // Last attempt failed with retryable status
        const error = new ApiError(
          `Max retries exceeded: ${response.status} ${response.statusText}: ${url}`,
          response.status,
          url,
        );
        config.onError?.(error);
        throw error;
      } catch (err) {
        if (err instanceof ApiError) throw err;

        lastError = err as Error;
        if (attempt < retryOpts.maxRetries) {
          const delay = computeDelay(attempt, retryOpts);
          console.warn(
            `[ApiClient] Network error on ${url}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${retryOpts.maxRetries}): ${lastError.message}`,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
    }

    throw lastError ?? new Error(`Request failed: ${config.baseUrl}${path}`);
  }

  async function jsonRequest<T>(path: string, init: RequestInit): Promise<T> {
    const response = await request(path, init);
    // Handle 204 No Content
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  return {
    request,
    get<T>(path: string, init?: RequestInit) {
      return jsonRequest<T>(path, { ...init, method: 'GET' });
    },
    post<T>(path: string, body?: unknown, init?: RequestInit) {
      return jsonRequest<T>(path, {
        ...init,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...init?.headers },
        body: body != null ? JSON.stringify(body) : undefined,
      });
    },
    put<T>(path: string, body?: unknown, init?: RequestInit) {
      return jsonRequest<T>(path, {
        ...init,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...init?.headers },
        body: body != null ? JSON.stringify(body) : undefined,
      });
    },
    patch<T>(path: string, body?: unknown, init?: RequestInit) {
      return jsonRequest<T>(path, {
        ...init,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...init?.headers },
        body: body != null ? JSON.stringify(body) : undefined,
      });
    },
    delete<T>(path: string, init?: RequestInit) {
      return jsonRequest<T>(path, { ...init, method: 'DELETE' });
    },
  };
}
