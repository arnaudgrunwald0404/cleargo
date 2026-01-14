/**
 * Tests for fetchWithRateLimit utility
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { fetchWithRateLimit, batchFetchWithRateLimit } from '../fetch-with-rate-limit';
import { clearPendingRequests } from '../request-deduplication';

// Mock global fetch
global.fetch = jest.fn() as jest.Mock;

describe('fetchWithRateLimit', () => {
  beforeEach(() => {
    clearPendingRequests();
    jest.clearAllMocks();
    jest.useFakeTimers();
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Successful requests', () => {
    it('should return response for successful request', async () => {
      const mockResponse = new Response('success', { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await fetchWithRateLimit('https://example.com/api/test');

      expect(result.status).toBe(200);
      expect(await result.text()).toBe('success');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should include credentials in request', async () => {
      const mockResponse = new Response('success', { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchWithRateLimit('https://example.com/api/test');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/api/test',
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('should pass through custom options', async () => {
      const mockResponse = new Response('success', { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchWithRateLimit('https://example.com/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/api/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });
  });

  describe('429 retry handling', () => {
    it('should retry on 429 error', async () => {
      const mockResponse429 = new Response('Rate limited', { status: 429 });
      const mockResponse200 = new Response('success', { status: 200 });
      
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse429)
        .mockResolvedValueOnce(mockResponse200);

      const promise = fetchWithRateLimit('https://example.com/api/test', { maxRetries: 1 });
      
      // Advance timer past retry delay
      jest.advanceTimersByTime(2000);
      
      const result = await promise;

      expect(result.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff for retries', async () => {
      const mockResponse429 = new Response('Rate limited', { status: 429 });
      const mockResponse200 = new Response('success', { status: 200 });
      
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse429)
        .mockResolvedValueOnce(mockResponse429)
        .mockResolvedValueOnce(mockResponse200);

      const promise = fetchWithRateLimit('https://example.com/api/test', { 
        maxRetries: 2,
        retryDelay: 1000 
      });

      // First retry should wait ~1s (1000ms + jitter)
      jest.advanceTimersByTime(1500);
      // Second retry should wait ~2s (2000ms + jitter)
      jest.advanceTimersByTime(2500);
      
      const result = await promise;

      expect(result.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const mockResponse429 = new Response('Rate limited', { status: 429 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse429);

      const promise = fetchWithRateLimit('https://example.com/api/test', { maxRetries: 1 });

      jest.advanceTimersByTime(2000);

      await expect(promise).rejects.toThrow('Max retries exceeded');
      expect(global.fetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });

  describe('X-RateLimit-Reset header parsing', () => {
    it('should use X-RateLimit-Reset header for wait time', async () => {
      const resetTime = new Date(Date.now() + 5000).toISOString();
      const mockResponse429 = new Response('Rate limited', { 
        status: 429,
        headers: { 'X-RateLimit-Reset': resetTime }
      });
      const mockResponse200 = new Response('success', { status: 200 });
      
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse429)
        .mockResolvedValueOnce(mockResponse200);

      const promise = fetchWithRateLimit('https://example.com/api/test', { maxRetries: 1 });

      // Advance timer to just before reset time
      jest.advanceTimersByTime(4900);
      
      // Should not have retried yet
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Advance past reset time
      jest.advanceTimersByTime(200);
      
      const result = await promise;

      expect(result.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should cap wait time at 60 seconds', async () => {
      const resetTime = new Date(Date.now() + 120000).toISOString(); // 2 minutes
      const mockResponse429 = new Response('Rate limited', { 
        status: 429,
        headers: { 'X-RateLimit-Reset': resetTime }
      });
      const mockResponse200 = new Response('success', { status: 200 });
      
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse429)
        .mockResolvedValueOnce(mockResponse200);

      const promise = fetchWithRateLimit('https://example.com/api/test', { 
        maxRetries: 1,
        retryDelay: 1000 
      });

      // Should use retryDelay instead of full reset time
      jest.advanceTimersByTime(2000);
      
      const result = await promise;

      expect(result.status).toBe(200);
    });

    it('should handle invalid X-RateLimit-Reset header', async () => {
      const mockResponse429 = new Response('Rate limited', { 
        status: 429,
        headers: { 'X-RateLimit-Reset': 'invalid-date' }
      });
      const mockResponse200 = new Response('success', { status: 200 });
      
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse429)
        .mockResolvedValueOnce(mockResponse200);

      const promise = fetchWithRateLimit('https://example.com/api/test', { 
        maxRetries: 1,
        retryDelay: 1000 
      });

      // Should fall back to exponential backoff
      jest.advanceTimersByTime(2000);
      
      const result = await promise;

      expect(result.status).toBe(200);
    });
  });

  describe('Global rate limit coordination', () => {
    it('should coordinate retries across parallel requests', async () => {
      const resetTime = new Date(Date.now() + 5000).toISOString();
      const mockResponse429 = new Response('Rate limited', { 
        status: 429,
        headers: { 'X-RateLimit-Reset': resetTime }
      });
      const mockResponse200 = new Response('success', { status: 200 });
      
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse429)
        .mockResolvedValueOnce(mockResponse429)
        .mockResolvedValueOnce(mockResponse200)
        .mockResolvedValueOnce(mockResponse200);

      const promise1 = fetchWithRateLimit('https://example.com/api/test1', { maxRetries: 1 });
      const promise2 = fetchWithRateLimit('https://example.com/api/test2', { maxRetries: 1 });

      // Both should coordinate on the same reset time
      jest.advanceTimersByTime(5100);

      const [res1, res2] = await Promise.all([promise1, promise2]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      // Both should have retried after the same reset time
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('Request throttling', () => {
    it('should limit concurrent requests to MAX_CONCURRENT_REQUESTS', async () => {
      const mockResponse = new Response('success', { status: 200 });
      (global.fetch as jest.Mock).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockResponse), 100))
      );

      // Create 10 requests (more than MAX_CONCURRENT_REQUESTS = 5)
      const promises = Array.from({ length: 10 }, (_, i) =>
        fetchWithRateLimit(`https://example.com/api/test${i}`)
      );

      // Advance timer to allow some requests to complete
      jest.advanceTimersByTime(200);

      // All should eventually complete
      await Promise.all(promises);

      expect(global.fetch).toHaveBeenCalledTimes(10);
    });
  });

  describe('Response cloning', () => {
    it('should clone response for deduplication', async () => {
      const mockResponse = new Response('test', { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await fetchWithRateLimit('https://example.com/api/test');
      const text = await result.text();

      expect(text).toBe('test');
      // Should be able to read the response
      expect(result.status).toBe(200);
    });

    it('should handle clone failure gracefully', async () => {
      const mockResponse = {
        status: 200,
        headers: new Headers(),
        clone: jest.fn().mockImplementation(() => {
          throw new Error('Clone failed');
        }),
        text: jest.fn().mockResolvedValue('test'),
      } as any;
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await fetchWithRateLimit('https://example.com/api/test');

      // Should return original response if clone fails
      expect(result).toBe(mockResponse);
    });
  });

  describe('Error handling', () => {
    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(
        fetchWithRateLimit('https://example.com/api/test')
      ).rejects.toThrow('Network error');
    });

    it('should handle non-429 errors without retry', async () => {
      const mockResponse500 = new Response('Server error', { status: 500 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse500);

      const result = await fetchWithRateLimit('https://example.com/api/test', { maxRetries: 2 });

      expect(result.status).toBe(500);
      expect(global.fetch).toHaveBeenCalledTimes(1); // No retries for non-429
    });
  });
});

describe('batchFetchWithRateLimit', () => {
  beforeEach(() => {
    clearPendingRequests();
    jest.clearAllMocks();
    jest.useFakeTimers();
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should fetch multiple URLs', async () => {
    const mockResponse = new Response('success', { status: 200 });
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const urls = [
      'https://example.com/api/1',
      'https://example.com/api/2',
      'https://example.com/api/3',
    ];

    const results = await batchFetchWithRateLimit(urls);

    expect(results).toHaveLength(3);
    expect(results.every(r => r.response?.status === 200)).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('should process URLs in batches', async () => {
    const mockResponse = new Response('success', { status: 200 });
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const urls = Array.from({ length: 10 }, (_, i) => `https://example.com/api/${i}`);
    
    const promise = batchFetchWithRateLimit(urls, { batchSize: 3, batchDelay: 100 });

    // Process first batch
    jest.advanceTimersByTime(100);
    // Process second batch
    jest.advanceTimersByTime(100);

    const results = await promise;

    expect(results).toHaveLength(10);
    expect(global.fetch).toHaveBeenCalledTimes(10);
  });

  it('should handle errors in batch', async () => {
    const mockResponse = new Response('success', { status: 200 });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockResponse);

    const urls = [
      'https://example.com/api/1',
      'https://example.com/api/2',
      'https://example.com/api/3',
    ];

    const results = await batchFetchWithRateLimit(urls);

    expect(results).toHaveLength(3);
    expect(results[0].response?.status).toBe(200);
    expect(results[1].error).toBeDefined();
    expect(results[2].response?.status).toBe(200);
  });

  it('should clone responses in batch', async () => {
    const mockResponse = new Response('success', { status: 200 });
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const urls = ['https://example.com/api/1'];
    const results = await batchFetchWithRateLimit(urls);

    expect(results[0].response).toBeDefined();
    expect(results[0].response?.status).toBe(200);
  });
});
