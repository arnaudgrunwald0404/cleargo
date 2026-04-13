/**
 * @anthropic-internal/shared - Supabase Client Factory
 *
 * Creates browser, server, and admin Supabase clients with consistent
 * configuration. Handles the common patterns: custom fetch with timeouts,
 * cookie-based auth, and RLS bypass for admin operations.
 *
 * Extracted from ClearGo's supabase/client.ts and supabase/server.ts.
 *
 * Usage:
 *   const db = createDbClients({
 *     supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *     supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
 *     supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
 *   });
 *
 *   // Browser (respects RLS)
 *   const client = db.browser();
 *
 *   // Server (respects RLS, uses cookies)
 *   const client = db.server(cookieStore);
 *
 *   // Admin (bypasses RLS)
 *   const client = db.admin();
 */

import type { DbClientConfig } from '../types';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Custom fetch with timeout and JSON Accept header.
 * Prevents 406 errors from Supabase and adds network timeout protection.
 */
function createSupabaseFetch(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  return async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers = new Headers(init?.headers);
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    try {
      return await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Supabase request timed out after ${timeoutMs}ms: ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Cookie adapter interface — matches both Next.js cookies() and
 * any custom cookie store implementations.
 */
export interface CookieStore {
  getAll(): Array<{ name: string; value: string }> | Promise<Array<{ name: string; value: string }>>;
  set(name: string, value: string, options?: Record<string, unknown>): void | Promise<void>;
  delete(name: string): void | Promise<void>;
}

export interface DbClients {
  /**
   * Create a browser-side client (for use in React components).
   * Respects RLS, uses anon key.
   */
  browser(options?: { timeoutMs?: number }): unknown;

  /**
   * Create a server-side client (for use in API routes / server components).
   * Respects RLS, uses cookies for session.
   */
  server(cookieStore: CookieStore, options?: { timeoutMs?: number }): unknown;

  /**
   * Create an admin client that bypasses RLS.
   * Uses service role key. Only available server-side.
   */
  admin(options?: { timeoutMs?: number }): unknown;

  /** The raw config (URLs and keys) */
  config: DbClientConfig;
}

/**
 * Create a set of Supabase client factories.
 *
 * This function returns factory functions rather than client instances,
 * because each request needs a fresh server client (for cookie isolation).
 *
 * IMPORTANT: The actual @supabase/supabase-js and @supabase/ssr imports
 * are dynamic to keep them as optional peer dependencies.
 */
export function createDbClients(dbConfig: DbClientConfig): DbClients {
  return {
    config: dbConfig,

    browser(options) {
      // Dynamic import to avoid bundling Supabase in non-Supabase apps
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createBrowserClient } = require('@supabase/ssr');
      return createBrowserClient(dbConfig.supabaseUrl, dbConfig.supabaseAnonKey, {
        global: {
          fetch: createSupabaseFetch(options?.timeoutMs),
        },
        auth: {
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      });
    },

    server(cookieStore, options) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createServerClient } = require('@supabase/ssr');
      return createServerClient(dbConfig.supabaseUrl, dbConfig.supabaseAnonKey, {
        cookies: {
          async getAll() {
            return await Promise.resolve(cookieStore.getAll());
          },
          async setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
            for (const { name, value, options: opts } of cookiesToSet) {
              try {
                await cookieStore.set(name, value, opts);
              } catch {
                // Swallow in Server Components (read-only cookie store)
              }
            }
          },
        },
        global: {
          fetch: createSupabaseFetch(options?.timeoutMs),
        },
      });
    },

    admin(options) {
      if (!dbConfig.supabaseServiceRoleKey) {
        throw new Error(
          'Cannot create admin client: supabaseServiceRoleKey is not configured. ' +
          'Set SUPABASE_SERVICE_ROLE_KEY in your environment.',
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createClient } = require('@supabase/supabase-js');
      return createClient(dbConfig.supabaseUrl, dbConfig.supabaseServiceRoleKey, {
        auth: { persistSession: false },
        global: {
          fetch: createSupabaseFetch(options?.timeoutMs),
        },
      });
    },
  };
}

export { createSupabaseFetch };
