import { createBrowserClient } from '@supabase/ssr'

// Custom fetch that ensures proper Accept header to avoid 406 errors
const customFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
    const headers = new Headers(options?.headers);
    
    // Always set Accept header for Supabase REST API (PostgREST)
    // PostgREST requires application/json or application/vnd.pgjson.object+json
    // We set both to ensure compatibility with all query types
    headers.set('Accept', 'application/json, application/vnd.pgjson.object+json');
    
    return fetch(url, {
        ...options,
        headers: Object.fromEntries(headers.entries()),
        credentials: 'include', // Ensure cookies are sent with requests
    });
};

// Cookie-based storage for PKCE code_verifier
// CRITICAL: Supabase's createBrowserClient uses localStorage by default for PKCE,
// but we need cookies so the server-side callback can access the code_verifier
const cookieStorage = {
    getItem: (key: string): string | null => {
        if (typeof document === 'undefined') return null;
        
        // Parse cookies
        const cookies = document.cookie.split(';').reduce((acc, cookie) => {
            const [name, ...rest] = cookie.trim().split('=');
            acc[name] = rest.join('=');
            return acc;
        }, {} as Record<string, string>);
        
        const value = cookies[key] || null;
        
        // Log PKCE-related storage access
        if (key.includes('code-verifier') || key.includes('code_verifier') || key.includes('auth')) {
            console.log('🔍 Storage getItem:', { key, found: !!value, source: value ? 'cookie' : 'none' });
        }
        
        return value;
    },
    setItem: (key: string, value: string): void => {
        if (typeof document === 'undefined') return;
        
        // CRITICAL: For PKCE code_verifier, we MUST use cookies, not localStorage
        // Set cookie without domain so it works on exact domain match
        // SameSite=Lax allows it to be sent with redirects from Google
        // Secure flag required for HTTPS
        const isSecure = window.location.protocol === 'https:';
        const cookieString = `${key}=${value}; path=/; SameSite=Lax; ${isSecure ? 'Secure;' : ''} max-age=600`; // 10 minutes
        
        document.cookie = cookieString;
        
        // Log PKCE-related storage writes
        if (key.includes('code-verifier') || key.includes('code_verifier') || key.includes('auth')) {
            console.log('✅ Storage setItem (cookie):', { key, valueLength: value.length, isSecure, cookieString });
        }
        
        // Also store in localStorage as backup (Supabase might check both)
        try {
            localStorage.setItem(key, value);
        } catch {
            // Ignore localStorage errors (e.g., in private browsing)
        }
    },
    removeItem: (key: string): void => {
        if (typeof document === 'undefined') return;
        
        // Remove cookie
        document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        
        // Also remove from localStorage
        try {
            localStorage.removeItem(key);
        } catch {
            // Ignore localStorage errors
        }
    },
};

export function createClient() {
    // Important: disable client-side auto refresh to avoid races with
    // server-side refresh (middleware). When both refresh at once, Supabase
    // rotates the refresh token and the client may keep using the old one,
    // leading to "Invalid Refresh Token: Already Used" loops.
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
                flowType: 'pkce', // Explicitly use PKCE flow for OAuth
                storage: typeof window !== 'undefined' ? cookieStorage : undefined,
            },
        }
    )
}
