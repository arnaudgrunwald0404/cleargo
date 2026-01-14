/**
 * Tests for rate limiting functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { rateLimit, clearRateLimitStore, type RateLimitConfig } from '../rate-limit';

describe('Rate Limiting', () => {
  beforeEach(() => {
    clearRateLimitStore();
    // Mock Date.now to have predictable timestamps
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Rate limit window creation and expiration', () => {
    it('should create a new window for a new identifier', () => {
      const config: RateLimitConfig = { windowMs: 60000, maxRequests: 10 };
      const result = rateLimit('user1', config);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.resetTime).toBeGreaterThan(Date.now());
    });

    it('should create separate windows for different identifiers', () => {
      const config: RateLimitConfig = { windowMs: 60000, maxRequests: 10 };
      const result1 = rateLimit('user1', config);
      const result2 = rateLimit('user2', config);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result1.remaining).toBe(9);
      expect(result2.remaining).toBe(9);
    });

    it('should create a new window when the previous one expires', () => {
      const config: RateLimitConfig = { windowMs: 60000, maxRequests: 10 };
      
      // First request
      const result1 = rateLimit('user1', config);
      expect(result1.remaining).toBe(9);

      // Advance time past the window
      jest.advanceTimersByTime(61000);

      // Next request should start a new window
      const result2 = rateLimit('user1', config);
      expect(result2.remaining).toBe(9);
      expect(result2.resetTime).toBeGreaterThan(result1.resetTime);
    });
  });

  describe('Request counting and limit enforcement', () => {
    it('should increment count for each request', () => {
      const config: RateLimitConfig = { windowMs: 60000, maxRequests: 5 };
      
      const result1 = rateLimit('user1', config);
      expect(result1.remaining).toBe(4);

      const result2 = rateLimit('user1', config);
      expect(result2.remaining).toBe(3);

      const result3 = rateLimit('user1', config);
      expect(result3.remaining).toBe(2);
    });

    it('should allow requests up to the limit', () => {
      const config: RateLimitConfig = { windowMs: 60000, maxRequests: 3 };
      
      const result1 = rateLimit('user1', config);
      expect(result1.allowed).toBe(true);

      const result2 = rateLimit('user1', config);
      expect(result2.allowed).toBe(true);

      const result3 = rateLimit('user1', config);
      expect(result3.allowed).toBe(true);
    });

    it('should deny requests when limit is exceeded', () => {
      const config: RateLimitConfig = { windowMs: 60000, maxRequests: 2 };
      
      rateLimit('user1', config);
      rateLimit('user1', config);
      const result3 = rateLimit('user1', config);

      expect(result3.allowed).toBe(false);
      expect(result3.remaining).toBe(0);
    });

    it('should track remaining requests correctly', () => {
      const config: RateLimitConfig = { windowMs: 60000, maxRequests: 10 };
      
      for (let i = 0; i < 5; i++) {
        const result = rateLimit('user1', config);
        expect(result.remaining).toBe(10 - i - 1);
      }
    });
  });

  describe('Different rate limit configurations', () => {
    it('should respect default config', () => {
      const result = rateLimit('user1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59); // Default is 60 maxRequests
    });

    it('should respect heavy config (40 requests)', () => {
      const config: RateLimitConfig = { windowMs: 60000, maxRequests: 40 };
      const result = rateLimit('user1', config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(39);
    });

    it('should respect light config (200 requests)', () => {
      const config: RateLimitConfig = { windowMs: 60000, maxRequests: 200 };
      const result = rateLimit('user1', config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(199);
    });

    it('should respect custom window duration', () => {
      const config: RateLimitConfig = { windowMs: 30000, maxRequests: 10 };
      const result1 = rateLimit('user1', config);
      const resetTime1 = result1.resetTime;

      // Advance time but not past window
      jest.advanceTimersByTime(20000);
      const result2 = rateLimit('user1', config);
      
      // Should still be in same window
      expect(result2.resetTime).toBe(resetTime1);

      // Advance past window
      jest.advanceTimersByTime(20000);
      const result3 = rateLimit('user1', config);
      
      // Should have new reset time
      expect(result3.resetTime).toBeGreaterThan(resetTime1);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero maxRequests', () => {
      const config: RateLimitConfig = { windowMs: 60000, maxRequests: 0 };
      const result = rateLimit('user1', config);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should handle very small window', () => {
      const config: RateLimitConfig = { windowMs: 1000, maxRequests: 5 };
      const result1 = rateLimit('user1', config);
      expect(result1.allowed).toBe(true);

      // Advance past window
      jest.advanceTimersByTime(1100);
      const result2 = rateLimit('user1', config);
      expect(result2.remaining).toBe(4); // New window
    });

    it('should handle multiple identifiers independently', () => {
      const config: RateLimitConfig = { windowMs: 60000, maxRequests: 2 };
      
      // User1 hits limit
      rateLimit('user1', config);
      rateLimit('user1', config);
      const user1Result = rateLimit('user1', config);
      expect(user1Result.allowed).toBe(false);

      // User2 should still have requests
      const user2Result = rateLimit('user2', config);
      expect(user2Result.allowed).toBe(true);
      expect(user2Result.remaining).toBe(0);
    });
  });
});
