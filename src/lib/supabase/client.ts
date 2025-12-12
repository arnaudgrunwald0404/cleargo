import { createBrowserClient } from '@supabase/ssr'

// Custom fetch that ensures proper Accept header to avoid 406 errors
const customFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
    const headers = new Headers(options?.headers);

    // Always set Accept header for Supabase REST API (PostgREST)
    // PostgREST requires application/json or application/vnd.pgjson.object+json
    headers.set('Accept', 'application/json, application/vnd.pgjson.object+json');

    return fetch(url, {
        ...options,
        headers: Object.fromEntries(headers.entries()),
    });
};

export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: {
                fetch: customFetch,
            },
            auth: {
                persistSession: true,
                autoRefreshToken: false, // let middleware refresh on navigation
                detectSessionInUrl: false, // we exchange the code on the server
                flowType: 'pkce',
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
                            const sameSite = options?.sameSite || 'Lax';
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
