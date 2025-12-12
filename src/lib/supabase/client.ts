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
    // Intercept localStorage to also store PKCE code_verifier in cookies
    // Supabase SSR might still use localStorage internally even with cookie methods
    if (typeof window !== 'undefined' && typeof Storage !== 'undefined') {
        const originalSetItem = Storage.prototype.setItem;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
        const codeVerifierCookieName = projectRef ? `sb-${projectRef}-auth-code-verifier` : null;

        Storage.prototype.setItem = function (key: string, value: string) {
            originalSetItem.call(this, key, value);

            // If it's a PKCE code_verifier, also store in cookie
            if ((key.includes('code-verifier') || key.includes('code_verifier') || key.includes('auth-code-verifier')) && codeVerifierCookieName) {
                const isSecure = window.location.protocol === 'https:';
                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                const secureFlag = isSecure && !isLocalhost ? 'Secure;' : '';
                const cookieString = `${codeVerifierCookieName}=${encodeURIComponent(value)}; path=/; SameSite=Lax; ${secureFlag} max-age=600`;
                document.cookie = cookieString;
                console.log('🍪 Intercepted localStorage.setItem -> cookie:', {
                    localStorageKey: key,
                    cookieName: codeVerifierCookieName,
                    valueLength: value.length,
                });
            }
        };
    }

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
                    const result = Object.entries(cookies).map(([name, value]) => ({ name, value }));
                    
                    // Log code_verifier access for debugging
                    const codeVerifier = result.find(c => c.name.includes('code-verifier') || c.name.includes('code_verifier'));
                    if (codeVerifier) {
                        console.log('🍪 Cookie getAll - Found code_verifier:', codeVerifier.name);
                    }
                    
                    return result;
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
                            
                            const cookieString = `${name}=${encodeURIComponent(value)}; path=${path}; SameSite=${sameSite}; ${secureFlag} ${maxAge}`;
                            document.cookie = cookieString;
                            
                            // Log code_verifier storage for debugging
                            if (name.includes('code-verifier') || name.includes('code_verifier')) {
                                console.log('🍪 Cookie setAll - Storing code_verifier:', {
                                    name,
                                    valueLength: value.length,
                                    path,
                                    sameSite,
                                    secure: !!secureFlag,
                                    domain: window.location.hostname,
                                });
                            }
                        }
                    });
                },
            },
        }
    );
}
