/**
 * Test utilities for mocking Supabase, auth, and other dependencies
 */

import { jest } from '@jest/globals';

/**
 * Creates a mock Supabase client with chainable query builder
 */
export function createMockSupabaseClient(data: any = null, error: any = null) {
  const mockClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    like: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data, error }),
    maybeSingle: jest.fn().mockResolvedValue({ data, error }),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
  };

  // Make all query methods return the mock client for chaining
  const chainableMethods = [
    'from', 'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'or',
    'order', 'limit', 'range'
  ];

  chainableMethods.forEach(method => {
    if (typeof mockClient[method as keyof typeof mockClient] === 'function') {
      (mockClient[method as keyof typeof mockClient] as jest.Mock).mockReturnValue(mockClient);
    }
  });

  return mockClient;
}

/**
 * Creates a mock authenticated user
 */
export function createMockUser(overrides: Partial<{
  id: string;
  email: string;
  roles: string[];
  role: string;
  first_name: string;
  last_name: string;
}> = {}) {
  return {
    id: 'user-123',
    email: 'test@example.com',
    roles: ['PRODUCT_OPS'],
    role: 'PRODUCT_OPS',
    first_name: 'Test',
    last_name: 'User',
    ...overrides,
  };
}

/**
 * Creates a mock Supabase auth user
 */
export function createMockAuthUser(overrides: Partial<{
  id: string;
  email: string;
}> = {}) {
  return {
    id: 'auth-user-123',
    email: 'test@example.com',
    ...overrides,
  };
}

/**
 * Resets rate limit state (clears the in-memory store)
 * Note: This requires access to the internal rate limit store
 */
export function resetRateLimitState() {
  // This will be implemented in the rate-limit test file
  // where we can access the internal store
}

/**
 * Creates a mock NextRequest
 */
export function createMockRequest(overrides: Partial<{
  url: string;
  method: string;
  headers: Headers;
  cookies: any;
  ip: string;
  body: any;
}> = {}) {
  const headers = overrides.headers || new Headers();
  const cookies = overrides.cookies || {
    getAll: jest.fn().mockReturnValue([]),
    get: jest.fn(),
    set: jest.fn(),
  };

  return {
    url: overrides.url || 'http://localhost:3000/api/test',
    method: overrides.method || 'GET',
    headers,
    cookies,
    ip: overrides.ip || '127.0.0.1',
    json: jest.fn().mockResolvedValue(overrides.body || {}),
    ...overrides,
  } as any;
}

/**
 * Creates a mock NextResponse
 */
export function createMockResponse() {
  const headers = new Headers();
  return {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    headers,
    ok: true,
    statusText: 'OK',
  } as any;
}
