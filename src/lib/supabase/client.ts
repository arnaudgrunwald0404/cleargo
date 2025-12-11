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
        // NOTE: Don't set credentials: 'include' here - it causes CORS issues with Supabase's wildcard CORS headers
        // Supabase handles cookies automatically through its own mechanisms
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
    // CRITICAL: Intercept ALL storage operations to ensure PKCE code_verifier is in cookies
    // Supabase SSR might use localStorage, sessionStorage, or its own storage internally
    if (typeof window !== 'undefined') {
        // Intercept localStorage
        if (typeof Storage !== 'undefined') {
            const originalSetItem = Storage.prototype.setItem;
            const originalGetItem = Storage.prototype.getItem;
            
            Storage.prototype.setItem = function(key: string, value: string) {
                originalSetItem.call(this, key, value);
                
                // If it's a PKCE-related key, ALWAYS set as cookie
                if (key.includes('code-verifier') || key.includes('code_verifier') || key.includes('auth-code-verifier') || key.includes('auth_code_verifier')) {
                    const isSecure = window.location.protocol === 'https:';
                    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
                    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
                    
                    // Set cookie with the exact name Supabase expects
                    const cookieName = projectRef ? `sb-${projectRef}-auth-code-verifier` : key;
                    const cookieString = `${cookieName}=${value}; path=/; SameSite=Lax; ${isSecure ? 'Secure;' : ''} max-age=600`;
                    document.cookie = cookieString;
                    console.log('🍪 Intercepted Storage.setItem -> cookie:', { 
                        key, 
                        cookieName, 
                        valueLength: value.length,
                        currentDomain: window.location.hostname
                    });
                }
            };
            
            Storage.prototype.getItem = function(key: string): string | null {
                const value = originalGetItem.call(this, key);
                
                // If PKCE-related and not in localStorage, try cookies
                if (!value && (key.includes('code-verifier') || key.includes('code_verifier') || key.includes('auth-code-verifier'))) {
                    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
                        const [name, ...rest] = cookie.trim().split('=');
                        acc[name] = rest.join('=');
                        return acc;
                    }, {} as Record<string, string>);
                    
                    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
                    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
                    const cookieName = projectRef ? `sb-${projectRef}-auth-code-verifier` : key;
                    const cookieValue = cookies[cookieName] || cookies[key] || null;
                    
                    if (cookieValue) {
                        console.log('🍪 Intercepted Storage.getItem -> found in cookie:', { key, cookieName });
                        return cookieValue;
                    }
                }
                
                return value;
            };
        }
        
        // Also intercept sessionStorage
        if (typeof sessionStorage !== 'undefined') {
            const originalSessionSetItem = sessionStorage.setItem.bind(sessionStorage);
            sessionStorage.setItem = function(key: string, value: string) {
                originalSessionSetItem(key, value);
                
                if (key.includes('code-verifier') || key.includes('code_verifier') || key.includes('auth-code-verifier')) {
                    const isSecure = window.location.protocol === 'https:';
                    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
                    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
                    const cookieName = projectRef ? `sb-${projectRef}-auth-code-verifier` : key;
                    const cookieString = `${cookieName}=${value}; path=/; SameSite=Lax; ${isSecure ? 'Secure;' : ''} max-age=600`;
                    document.cookie = cookieString;
                    console.log('🍪 Intercepted sessionStorage.setItem -> cookie:', { key, cookieName });
                }
            };
        }
    }
    
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
