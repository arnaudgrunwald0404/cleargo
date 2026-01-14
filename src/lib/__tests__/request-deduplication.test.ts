/**
 * Tests for request deduplication utility
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { deduplicateRequest, clearPendingRequests } from '../request-deduplication';

describe('Request Deduplication', () => {
  beforeEach(() => {
    clearPendingRequests();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Deduplication of in-flight requests', () => {
    it('should return the same promise for duplicate requests', async () => {
      let callCount = 0;
      const fetchFn = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(new Response('test', { status: 200 }));
      });

      const url = 'https://example.com/api/test';
      const promise1 = deduplicateRequest(url, fetchFn);
      const promise2 = deduplicateRequest(url, fetchFn);

      expect(promise1).toBe(promise2);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      await Promise.all([promise1, promise2]);
      expect(callCount).toBe(1);
    });

    it('should create new requests for different URLs', async () => {
      const fetchFn = jest.fn().mockResolvedValue(new Response('test', { status: 200 }));

      const promise1 = deduplicateRequest('https://example.com/api/1', fetchFn);
      const promise2 = deduplicateRequest('https://example.com/api/2', fetchFn);

      expect(promise1).not.toBe(promise2);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('should share response between multiple callers', async () => {
      const response = new Response('shared response', { status: 200 });
      const fetchFn = jest.fn().mockResolvedValue(response);

      const url = 'https://example.com/api/test';
      const promise1 = deduplicateRequest(url, fetchFn);
      const promise2 = deduplicateRequest(url, fetchFn);

      const [res1, res2] = await Promise.all([promise1, promise2]);
      
      // Both should get the same response
      expect(await res1.text()).toBe('shared response');
      expect(await res2.text()).toBe('shared response');
    });
  });

  describe('Cache TTL expiration', () => {
    it('should create new request after TTL expires', async () => {
      const fetchFn = jest.fn().mockResolvedValue(new Response('test', { status: 200 }));
      const url = 'https://example.com/api/test';

      // First request
      const promise1 = deduplicateRequest(url, fetchFn);
      await promise1;

      // Advance time past TTL (5 seconds)
      jest.advanceTimersByTime(5100);

      // Second request should create a new fetch
      const promise2 = deduplicateRequest(url, fetchFn);
      await promise2;

      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('should reuse request within TTL', async () => {
      const fetchFn = jest.fn().mockResolvedValue(new Response('test', { status: 200 }));
      const url = 'https://example.com/api/test';

      // First request
      const promise1 = deduplicateRequest(url, fetchFn);
      await promise1;

      // Advance time but not past TTL
      jest.advanceTimersByTime(3000);

      // Second request should reuse
      const promise2 = deduplicateRequest(url, fetchFn);
      await promise2;

      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cleanup of old entries', () => {
    it('should remove completed requests from cache', async () => {
      const fetchFn = jest.fn().mockResolvedValue(new Response('test', { status: 200 }));
      const url = 'https://example.com/api/test';

      const promise = deduplicateRequest(url, fetchFn);
      await promise;

      // Wait for cleanup delay (100ms)
      jest.advanceTimersByTime(200);

      // New request should create new fetch (cache was cleared)
      const promise2 = deduplicateRequest(url, fetchFn);
      await promise2;

      // Should have been called twice (first cleared, second new)
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Edge cases', () => {
    it('should handle fetch errors gracefully', async () => {
      const fetchFn = jest.fn().mockRejectedValue(new Error('Network error'));
      const url = 'https://example.com/api/test';

      const promise = deduplicateRequest(url, fetchFn);
      
      await expect(promise).rejects.toThrow('Network error');
    });

    it('should handle multiple concurrent requests to same URL', async () => {
      let resolveFn: (value: Response) => void;
      const fetchFn = jest.fn().mockImplementation(() => {
        return new Promise<Response>((resolve) => {
          resolveFn = resolve;
        });
      });

      const url = 'https://example.com/api/test';
      const promise1 = deduplicateRequest(url, fetchFn);
      const promise2 = deduplicateRequest(url, fetchFn);
      const promise3 = deduplicateRequest(url, fetchFn);

      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Resolve the fetch
      resolveFn!(new Response('test', { status: 200 }));

      const [res1, res2, res3] = await Promise.all([promise1, promise2, promise3]);
      expect(await res1.text()).toBe('test');
      expect(await res2.text()).toBe('test');
      expect(await res3.text()).toBe('test');
    });

    it('should handle cache expiration during request', async () => {
      let resolveFn: (value: Response) => void;
      const fetchFn = jest.fn().mockImplementation(() => {
        return new Promise<Response>((resolve) => {
          resolveFn = resolve;
        });
      });

      const url = 'https://example.com/api/test';
      const promise1 = deduplicateRequest(url, fetchFn);

      // Advance time past TTL while request is in-flight
      jest.advanceTimersByTime(5100);

      // New request should still wait for in-flight request
      const promise2 = deduplicateRequest(url, fetchFn);

      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Resolve the fetch
      resolveFn!(new Response('test', { status: 200 }));

      await Promise.all([promise1, promise2]);
    });
  });

  describe('clearPendingRequests', () => {
    it('should clear all pending requests', async () => {
      const fetchFn = jest.fn().mockResolvedValue(new Response('test', { status: 200 }));
      const url = 'https://example.com/api/test';

      // Create a request
      deduplicateRequest(url, fetchFn);

      // Clear pending requests
      clearPendingRequests();

      // New request should create new fetch
      const promise2 = deduplicateRequest(url, fetchFn);
      await promise2;

      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });
});
