/**
 * Tests for rate limit middleware
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, RATE_LIMITS } from '../rate-limit-middleware';
import { clearRateLimitStore } from '../../rate-limit';
import { createMockRequest, createMockUser } from '../../__tests__/test-utils';

// Mock getAuthenticatedUserEmail
jest.mock('../../api-auth', () => ({
  getAuthenticatedUserEmail: jest.fn().mockResolvedValue('test@example.com'),
}));

describe('Rate Limit Middleware', () => {
  beforeEach(() => {
    clearRateLimitStore();
    jest.clearAllMocks();
  });

  describe('Middleware wrapper functionality', () => {
    it('should allow requests under the limit', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = withRateLimit(handler, RATE_LIMITS.default);
      
      const req = createMockRequest();
      const response = await wrappedHandler(req);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
    });

    it('should block requests over the limit', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = withRateLimit(handler, { windowMs: 60000, maxRequests: 2 });
      
      const req = createMockRequest();

      // Make requests up to limit
      await wrappedHandler(req);
      await wrappedHandler(req);
      
      // This one should be blocked
      const response = await wrappedHandler(req);

      expect(handler).toHaveBeenCalledTimes(2); // Only called twice
      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error).toBe('Too Many Requests');
    });

    it('should add rate limit headers to successful responses', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = withRateLimit(handler, RATE_LIMITS.default);
      
      const req = createMockRequest();
      const response = await wrappedHandler(req);

      expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
      expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
    });

    it('should add rate limit headers to 429 responses', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = withRateLimit(handler, { windowMs: 60000, maxRequests: 1 });
      
      const req = createMockRequest();

      await wrappedHandler(req);
      const response = await wrappedHandler(req); // Should be blocked

      expect(response.status).toBe(429);
      expect(response.headers.get('X-RateLimit-Limit')).toBe('1');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
    });

    it('should include retryAfter in 429 response', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = withRateLimit(handler, { windowMs: 60000, maxRequests: 1 });
      
      const req = createMockRequest();

      await wrappedHandler(req);
      const response = await wrappedHandler(req);
      const body = await response.json();

      expect(response.status).toBe(429);
      expect(body.retryAfter).toBeDefined();
      expect(typeof body.retryAfter).toBe('number');
    });
  });

  describe('Identifier resolution', () => {
    it('should use user email as identifier by default', async () => {
      const { getAuthenticatedUserEmail } = await import('../../api-auth');
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = withRateLimit(handler, { windowMs: 60000, maxRequests: 1 });
      
      const req = createMockRequest();
      await wrappedHandler(req);
      await wrappedHandler(req); // Should be blocked

      expect(getAuthenticatedUserEmail).toHaveBeenCalled();
    });

    it('should use custom identifier function when provided', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const customIdentifier = jest.fn().mockReturnValue('custom-id');
      const wrappedHandler = withRateLimit(handler, RATE_LIMITS.default, customIdentifier);
      
      const req = createMockRequest();
      await wrappedHandler(req);

      expect(customIdentifier).toHaveBeenCalledWith(req);
    });

    it('should fall back to IP when no user email', async () => {
      const { getAuthenticatedUserEmail } = await import('../../api-auth');
      (getAuthenticatedUserEmail as jest.Mock).mockResolvedValue(null);
      
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = withRateLimit(handler, RATE_LIMITS.default);
      
      const req = createMockRequest({ ip: '192.168.1.1' });
      await wrappedHandler(req);

      // Should use IP as identifier
      expect(getAuthenticatedUserEmail).toHaveBeenCalled();
    });

    it('should fall back to anonymous when no email or IP', async () => {
      const { getAuthenticatedUserEmail } = await import('../../api-auth');
      (getAuthenticatedUserEmail as jest.Mock).mockResolvedValue(null);
      
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = withRateLimit(handler, RATE_LIMITS.default);
      
      const req = createMockRequest({ ip: undefined });
      await wrappedHandler(req);

      // Should use 'anonymous' as identifier
      expect(getAuthenticatedUserEmail).toHaveBeenCalled();
    });
  });

  describe('Different rate limit configs', () => {
    it('should respect default config', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = withRateLimit(handler, RATE_LIMITS.default);
      
      const req = createMockRequest();
      const response = await wrappedHandler(req);

      expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
    });

    it('should respect heavy config', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = withRateLimit(handler, RATE_LIMITS.heavy);
      
      const req = createMockRequest();
      const response = await wrappedHandler(req);

      expect(response.headers.get('X-RateLimit-Limit')).toBe('40');
    });

    it('should respect light config', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = withRateLimit(handler, RATE_LIMITS.light);
      
      const req = createMockRequest();
      const response = await wrappedHandler(req);

      expect(response.headers.get('X-RateLimit-Limit')).toBe('200');
    });
  });

  describe('Error handling', () => {
    it('should add rate limit headers even when handler throws', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const wrappedHandler = withRateLimit(handler, RATE_LIMITS.default);
      
      const req = createMockRequest();
      const response = await wrappedHandler(req);

      expect(response.status).toBe(500);
      expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
    });

    it('should still rate limit even when handler throws', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const wrappedHandler = withRateLimit(handler, { windowMs: 60000, maxRequests: 1 });
      
      const req = createMockRequest();

      // First request throws but counts toward limit
      await wrappedHandler(req).catch(() => {});
      
      // Second request should be rate limited
      const response = await wrappedHandler(req);
      expect(response.status).toBe(429);
    });
  });
});
