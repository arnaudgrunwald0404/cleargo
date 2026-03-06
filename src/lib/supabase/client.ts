import { createBrowserClient } from '@supabase/ssr'

// Custom fetch that ensures proper Accept header to avoid 406 errors
const customFetch = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    // Validate URL format
    if (!supabaseUrl) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set in environment variables');
    }

    // Convert url to string for error messages
    const urlString = typeof url === 'string' ? url : url.toString();

    const headers = new Headers(options?.headers);

    // Always set Accept header for Supabase REST API (PostgREST)
    // PostgREST requires application/json or application/vnd.pgjson.object+json
    headers.set('Accept', 'application/json, application/vnd.pgjson.object+json');

    // Create AbortController for timeout (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(url, {
            ...options,
            headers: Object.fromEntries(headers.entries()),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        // Log auth endpoint errors for debugging
        if (!response.ok && typeof url === 'string' && url.includes('/auth/v1/')) {
            let body: unknown = null;
            try {
                const text = await response.clone().text();
                body = text ? JSON.parse(text) : null;
            } catch {
                // ignore parse errors
            }
            console.error('❌ Supabase Auth API Error:', {
                url,
                status: response.status,
                statusText: response.statusText,
                method: options?.method || 'GET',
                body,
            });

            if (response.status === 404 && url.includes('/auth/v1/token')) {
                console.error('⚠️ Auth token endpoint not found. Please verify:');
                console.error('   1. NEXT_PUBLIC_SUPABASE_URL is correct:', supabaseUrl);
                console.error('   2. Supabase project exists and auth is enabled');
                console.error('   3. Supabase client library version is compatible');
            }
        }

        return response;
    } catch (error: any) {
        clearTimeout(timeoutId);
        
        // Provide more detailed error messages
        if (error.name === 'AbortError') {
            throw new Error(`Supabase request timed out after 30 seconds. URL: ${urlString}`);
        }
        
        if (error.message === 'Failed to fetch' || error.message?.includes('fetch failed') || error.message?.includes('Failed to fetch')) {
            // Check if it's a network error
            try {
                const urlObj = new URL(urlString);
                throw new Error(
                    `Failed to connect to Supabase at ${urlObj.origin}. ` +
                    `Please check:\n` +
                    `1. NEXT_PUBLIC_SUPABASE_URL is correct: ${supabaseUrl}\n` +
                    `2. The Supabase project is running and accessible\n` +
                    `3. Network connectivity is available\n` +
                    `4. CORS is properly configured for your domain\n` +
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
                    `4. CORS is properly configured for your domain\n` +
                    `Original error: ${error.message}`
                );
            }
        }
        
        throw error;
    }
};

export function createClient() {
    // Validate Supabase URL before creating client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
    }
    
    // Validate URL format
    if (!supabaseUrl.match(/^https:\/\/[^.]+\.supabase\.co$/)) {
        console.error('⚠️ Invalid Supabase URL format:', supabaseUrl);
        console.error('Expected format: https://[project-ref].supabase.co');
    }
    
    // Use new publishable key, fallback to legacy anon key for backward compatibility
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!publishableKey) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables');
    }

    return createBrowserClient(
        supabaseUrl,
        publishableKey,
        {
            global: {
                fetch: customFetch,
            },
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: false, // we exchange the code on the server - CRITICAL: prevents client-side code exchange
                flowType: 'pkce',
                // Don't specify storage - let Supabase SSR handle it automatically
                // storage: typeof window !== 'undefined' ? window.localStorage : undefined,
            },
            cookies: {
                getAll() {
                    // Only access document in browser environment
                    if (typeof document === 'undefined') {
                        return [];
                    }
                    
                    // Parse cookies from document.cookie
                    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
                        const [name, ...rest] = cookie.trim().split('=');
                        acc[name] = decodeURIComponent(rest.join('='));
                        return acc;
                    }, {} as Record<string, string>);
                    
                    // Convert to array format expected by Supabase SSR
                    return Object.entries(cookies).map(([name, value]) => ({ name, value }));
                },
                setAll(cookiesToSet) {
                    // Only access document/window in browser environment
                    if (typeof document === 'undefined' || typeof window === 'undefined') {
                        return;
                    }
                    
                    // Set cookies with proper attributes
                    cookiesToSet.forEach(({ name, value, options }) => {
                        if (value === undefined || value === null) {
                            // Remove cookie
                            document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
                        } else {
                            // Set cookie
                            const isSecure = window.location.protocol === 'https:';
                            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                            const secureFlag = isSecure && !isLocalhost ? 'Secure;' : '';
                            
                            // For code_verifier cookies, use SameSite=None for OAuth redirects
                            // For other cookies, use the provided sameSite or default to Lax
                            let sameSite = options?.sameSite || 'Lax';
                            if ((name.includes('code-verifier') || name.includes('code_verifier')) && isSecure && !isLocalhost) {
                                sameSite = 'None'; // Required for cross-site OAuth redirects
                            }
                            
                            const path = options?.path || '/';
                            const maxAge = options?.maxAge ? `max-age=${options.maxAge};` : '';
                            
                            document.cookie = `${name}=${encodeURIComponent(value)}; path=${path}; SameSite=${sameSite}; ${secureFlag} ${maxAge}`;
                        }
                    });
                },
            },
        }
    );
}
