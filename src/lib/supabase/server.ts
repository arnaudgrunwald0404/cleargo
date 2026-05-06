import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

// Custom fetch with better error handling, timeout, and retry for transient network errors
const customFetch = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    // Validate URL format
    if (!supabaseUrl) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set in environment variables');
    }

    // Convert url to string for error messages
    const urlString = typeof url === 'string' ? url : url.toString();

    const MAX_RETRIES = 3;
    let lastError: any;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error: any) {
            clearTimeout(timeoutId);
            lastError = error;

            if (error.name === 'AbortError') {
                throw new Error(`Supabase request timed out after 30 seconds. URL: ${urlString}`);
            }

            const isFetchFailed = error.message === 'fetch failed' || error.message?.includes('fetch failed');
            if (isFetchFailed && attempt < MAX_RETRIES - 1) {
                // Brief delay before retry (exponential backoff: 100ms, 200ms)
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
                continue;
            }

            throw error;
        }
    }

    // All retries exhausted — format a useful error
    try {
        const urlObj = new URL(urlString);
        throw new Error(
            `Failed to connect to Supabase at ${urlObj.origin} after ${MAX_RETRIES} attempts. ` +
            `Please check:\n` +
            `1. NEXT_PUBLIC_SUPABASE_URL is correct: ${supabaseUrl}\n` +
            `2. The Supabase project is running and accessible\n` +
            `3. Network connectivity is available\n` +
            `Original error: ${lastError?.message}`
        );
    } catch {
        throw new Error(
            `Failed to connect to Supabase after ${MAX_RETRIES} attempts. ` +
            `Please check:\n` +
            `1. NEXT_PUBLIC_SUPABASE_URL is correct: ${supabaseUrl}\n` +
            `2. The Supabase project is running and accessible\n` +
            `3. Network connectivity is available\n` +
            `Original error: ${lastError?.message}`
        );
    }
};

export function createClient(): SupabaseClient {
    // Use publishable key for authenticated requests (respects RLS)
    // Fallback to legacy anon key for backward compatibility
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!publishableKey || !supabaseUrl) {
        throw new Error('Missing Supabase environment variables');
    }

    return createServerClient(
        supabaseUrl,
        publishableKey,
        {
            global: {
                fetch: customFetch,
            },
            cookies: {
                async getAll() {
                    const cookieStore = await cookies();
                    return cookieStore.getAll();
                },
                async setAll(cookiesToSet) {
                    try {
                        const cookieStore = await cookies();
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, options);
                        });
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    );
}

/**
 * Service-role client for API routes / jobs. Uses `@supabase/supabase-js` directly
 * (no cookies) so requests always authenticate as `service_role`. A cookie-aware
 * `createServerClient(..., serviceRoleKey, { cookies })` can merge the user's
 * session and hit RLS as `authenticated` — breaking INSERT/upsert on tables that
 * only grant writes to `service_role`.
 */
export function createAdminClient(): SupabaseClient {
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!supabaseKey || !supabaseUrl) {
        throw new Error('Missing Supabase admin credentials');
    }

    return createSupabaseJsClient(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
        global: {
            fetch: customFetch,
        },
    });
}
