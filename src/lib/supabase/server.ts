import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

// Custom fetch with better error handling and timeout
const customFetch = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    // Validate URL format
    if (!supabaseUrl) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set in environment variables');
    }

    // Convert url to string for error messages
    const urlString = typeof url === 'string' ? url : url.toString();

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
        
        // Provide more detailed error messages
        if (error.name === 'AbortError') {
            throw new Error(`Supabase request timed out after 30 seconds. URL: ${urlString}`);
        }
        
        if (error.message === 'fetch failed' || error.message?.includes('fetch failed')) {
            // Check if it's a network error
            try {
                const urlObj = new URL(urlString);
                throw new Error(
                    `Failed to connect to Supabase at ${urlObj.origin}. ` +
                    `Please check:\n` +
                    `1. NEXT_PUBLIC_SUPABASE_URL is correct: ${supabaseUrl}\n` +
                    `2. The Supabase project is running and accessible\n` +
                    `3. Network connectivity is available\n` +
                    `Original error: ${error.message}`
                );
            } catch {
                // If URL parsing fails, provide generic error
                throw new Error(
                    `Failed to connect to Supabase. ` +
                    `Please check:\n` +
                    `1. NEXT_PUBLIC_SUPABASE_URL is correct: ${supabaseUrl}\n` +
                    `2. The Supabase project is running and accessible\n` +
                    `3. Network connectivity is available\n` +
                    `Original error: ${error.message}`
                );
            }
        }
        
        throw error;
    }
};

export function createClient(): SupabaseClient {
    // Use publishable key for authenticated requests (respects RLS)
    // Fallback to legacy anon key for backward compatibility
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    // #region agent log
    const fs = require('fs');
    const logEntry1 = {location:'supabase/server.ts:65',message:'createClient called',data:{hasPublishableKey:!!publishableKey,hasAnonKey:!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,hasSupabaseUrl:!!supabaseUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'};
    try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry1) + '\n'); } catch(e) {}
    // #endregion

    if (!publishableKey || !supabaseUrl) {
        // #region agent log
        const logEntry2 = {location:'supabase/server.ts:71',message:'Missing env vars error',data:{hasPublishableKey:!!publishableKey,hasSupabaseUrl:!!supabaseUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'};
        try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry2) + '\n'); } catch(e) {}
        // #endregion
        throw new Error('Missing Supabase environment variables');
    }

    // #region agent log
    const logEntry3 = {location:'supabase/server.ts:82',message:'Before createServerClient',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'};
    try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry3) + '\n'); } catch(e) {}
    // #endregion

    return createServerClient(
        supabaseUrl,
        publishableKey,
        {
            global: {
                fetch: customFetch,
            },
            cookies: {
                async getAll() {
                    // #region agent log
                    const fs2 = require('fs');
                    const logEntry4 = {location:'supabase/server.ts:91',message:'cookies.getAll called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'};
                    try { fs2.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry4) + '\n'); } catch(e) {}
                    // #endregion
                    const cookieStore = await cookies();
                    const allCookies = cookieStore.getAll();
                    // #region agent log
                    const logEntry5 = {location:'supabase/server.ts:95',message:'cookies.getAll result',data:{cookieCount:allCookies.length,cookieNames:allCookies.map(c=>c.name)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'};
                    try { fs2.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry5) + '\n'); } catch(e) {}
                    // #endregion
                    return allCookies;
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

// Create a client with service role key for admin operations (bypasses RLS)
export function createAdminClient(): SupabaseClient {
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!supabaseKey || !supabaseUrl) {
        throw new Error('Missing Supabase admin credentials');
    }

    // Use the regular createServerClient but with service role key
    // This bypasses RLS for admin operations
    return createServerClient(
        supabaseUrl,
        supabaseKey,
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
                        // Ignore in Server Components
                    }
                },
            },
        }
    );
}
