import { createBrowserClient } from '@supabase/ssr'

// Custom fetch that ensures proper Accept header to avoid 406 errors
// CRITICAL: Also blocks client-side token exchange attempts (should only happen server-side)
const customFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

    // BLOCK client-side token exchange - this should ONLY happen server-side in /auth/callback
    // Supabase client tries to exchange codes automatically, but we handle it server-side
    if (urlString.includes('/auth/v1/token') && options?.method === 'POST') {
        const urlObj = typeof url === 'string' ? new URL(url) : url instanceof URL ? url : new URL(url.url);
        if (urlObj.searchParams.get('grant_type') === 'pkce') {
            console.warn('🚫 Blocked client-side PKCE token exchange - this should only happen server-side');
            // Return a mock error response to prevent Supabase from retrying
            return new Response(JSON.stringify({
                error: 'client_side_exchange_blocked',
                error_description: 'Token exchange must happen server-side. Redirect to /auth/callback instead.'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

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

        // Check for exact key match first
        let value = cookies[key] || null;
        
        // If not found and it's a Supabase auth key, try to find by pattern
        if (!value && key.includes('auth')) {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
            const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
            
            // Try Supabase cookie name format: sb-{project-ref}-auth-token
            if (projectRef) {
                if (key.includes('code-verifier') || key.includes('code_verifier')) {
                    const cookieName = `sb-${projectRef}-auth-code-verifier`;
                    value = cookies[cookieName] || null;
                } else if (key.includes('auth-token') || key.includes('access-token')) {
                    const cookieName = `sb-${projectRef}-auth-token`;
                    value = cookies[cookieName] || null;
                } else if (key.includes('refresh-token')) {
                    const cookieName = `sb-${projectRef}-auth-token.refresh`;
                    value = cookies[cookieName] || null;
                }
            }
            
            // Fallback: check localStorage if cookie not found
            if (!value) {
                try {
                    value = localStorage.getItem(key);
                } catch {
                    // Ignore localStorage errors
                }
            }
        } else if (!value) {
            // For non-auth keys, also check localStorage
            try {
                value = localStorage.getItem(key);
            } catch {
                // Ignore localStorage errors
            }
        }

        // Log auth-related storage access
        if (key.includes('code-verifier') || key.includes('code_verifier') || key.includes('auth') || key.includes('token')) {
            console.log('🔍 Storage getItem:', { key, found: !!value, source: value ? (cookies[key] ? 'cookie' : 'localStorage') : 'none' });
        }

        return value;
    },
    setItem: (key: string, value: string): void => {
        if (typeof document === 'undefined') return;

        // CRITICAL: Store ALL Supabase auth-related keys in cookies so server can read them
        // This includes: PKCE code_verifier, session tokens, refresh tokens, etc.
        const isSecure = window.location.protocol === 'https:';
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
        
        // Determine cookie name based on key type
        let cookieName = key;
        let maxAge = 60 * 60 * 24 * 365; // Default: 1 year for session tokens
        
        if (key.includes('code-verifier') || key.includes('code_verifier') || key.includes('auth-code-verifier')) {
            // PKCE code_verifier - short-lived (10 minutes)
            if (projectRef && !key.includes(projectRef)) {
                cookieName = `sb-${projectRef}-auth-code-verifier`;
            }
            maxAge = 600; // 10 minutes
        } else if (key.includes('auth-token') || key.includes('access-token') || key.includes('refresh-token')) {
            // Session tokens - use Supabase's expected cookie name format
            if (projectRef && key.includes('sb-')) {
                // Already has project ref, use as-is
                cookieName = key;
            } else if (projectRef) {
                // Construct Supabase cookie name: sb-{project-ref}-auth-token
                if (key.includes('access-token') || key.includes('auth-token')) {
                    cookieName = `sb-${projectRef}-auth-token`;
                } else if (key.includes('refresh-token')) {
                    cookieName = `sb-${projectRef}-auth-token.refresh`;
                }
            }
            maxAge = 60 * 60 * 24 * 365; // 1 year for session tokens
        } else if (key.startsWith('sb-') && key.includes('auth')) {
            // Other Supabase auth keys - use as-is
            cookieName = key;
            maxAge = 60 * 60 * 24 * 365; // 1 year
        }

        // Set cookie with proper attributes
        const cookieString = `${cookieName}=${value}; path=/; SameSite=Lax; ${isSecure ? 'Secure;' : ''} max-age=${maxAge}`;
        document.cookie = cookieString;

        // Log auth-related storage writes
        if (key.includes('auth') || key.includes('token') || key.includes('code-verifier')) {
            console.log('✅ Storage setItem (cookie):', {
                key,
                cookieName,
                valueLength: value.length,
                isSecure,
                maxAge,
                currentDomain: window.location.hostname
            });
        }

        // Also store in localStorage as backup (Supabase client might check both)
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

            Storage.prototype.setItem = function (key: string, value: string) {
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

            Storage.prototype.getItem = function (key: string): string | null {
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
            sessionStorage.setItem = function (key: string, value: string) {
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
    // 
    // CRITICAL: Use custom storage adapter for PKCE code_verifier to ensure it's in cookies
    // Supabase stores code_verifier in localStorage by default, but we need it in cookies
    // so the server-side callback can access it. We use a hybrid approach:
    // - PKCE code_verifier: stored in cookies (for server access)
    // - Session tokens: stored in localStorage (Supabase default, synced to cookies by middleware)
    const hybridStorage = {
        getItem: (key: string): string | null => {
            // For PKCE code_verifier, check cookies first, then localStorage
            if (key.includes('code-verifier') || key.includes('code_verifier') || key.includes('auth-code-verifier')) {
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
                const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
                const cookieName = projectRef ? `sb-${projectRef}-auth-code-verifier` : key;
                
                // Check cookies first
                const cookies = document.cookie.split(';').reduce((acc, cookie) => {
                    const [name, ...rest] = cookie.trim().split('=');
                    acc[name] = decodeURIComponent(rest.join('='));
                    return acc;
                }, {} as Record<string, string>);
                
                if (cookies[cookieName]) {
                    return cookies[cookieName];
                }
            }
            
            // For everything else, use localStorage
            try {
                return localStorage.getItem(key);
            } catch {
                return null;
            }
        },
        setItem: (key: string, value: string): void => {
            // CRITICAL: For PKCE code_verifier, store in BOTH cookies and localStorage
            // Cookies are needed for server-side callback, localStorage for client-side access
            if (key.includes('code-verifier') || key.includes('code_verifier') || key.includes('auth-code-verifier')) {
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
                const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
                const cookieName = projectRef ? `sb-${projectRef}-auth-code-verifier` : key;
                
                // Set cookie with proper attributes - CRITICAL: must be set synchronously before redirect
                const isSecure = window.location.protocol === 'https:';
                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                const secureFlag = isSecure && !isLocalhost ? 'Secure;' : '';
                const cookieString = `${cookieName}=${encodeURIComponent(value)}; path=/; SameSite=Lax; ${secureFlag} max-age=600`;
                document.cookie = cookieString;
                
                console.log('🍪 PKCE code_verifier stored in cookie:', {
                    cookieName,
                    valueLength: value.length,
                    isSecure: !!secureFlag,
                    domain: window.location.hostname
                });
                
                // Also store in localStorage for client-side access
                try {
                    localStorage.setItem(key, value);
                } catch {
                    // Ignore localStorage errors
                }
                return;
            }
            
            // For everything else, use localStorage
            try {
                localStorage.setItem(key, value);
            } catch {
                // Ignore localStorage errors
            }
        },
        removeItem: (key: string): void => {
            // Remove from both cookies and localStorage
            if (key.includes('code-verifier') || key.includes('code_verifier') || key.includes('auth-code-verifier')) {
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
                const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
                const cookieName = projectRef ? `sb-${projectRef}-auth-code-verifier` : key;
                document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
            }
            
            try {
                localStorage.removeItem(key);
            } catch {
                // Ignore localStorage errors
            }
        },
    };

    const client = createBrowserClient(
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
                storage: hybridStorage, // Use hybrid storage for PKCE code_verifier
            },
        }
    );
    
    // CRITICAL: After signInWithPassword, we need to ensure the session is synced to cookies
    // Supabase SSR expects sessions in cookies, but createBrowserClient stores in localStorage
    // We intercept auth state changes to sync to cookies
    if (typeof window !== 'undefined') {
        client.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                console.log('✅ Auth state changed: SIGNED_IN - session available');
                // The middleware will sync this to cookies on the next request
                // But we can also manually trigger a cookie sync by making a request
                // For now, just log - the redirect to /dashboard will trigger middleware
            } else if (event === 'SIGNED_OUT') {
                console.log('🔴 Auth state changed: SIGNED_OUT');
            }
        });
    }

    // CRITICAL: Intercept Supabase's internal PKCE storage
    // Supabase SSR might store code_verifier in a way that bypasses our storage adapter
    // So we intercept the actual storage operations at the lowest level
    if (typeof window !== 'undefined') {
        // Override the client's internal storage if it exists
        // This is a last-resort attempt to catch the code_verifier
        const originalStorage = (client as any).storage;
        if (originalStorage && typeof originalStorage.setItem === 'function') {
            const originalSetItem = originalStorage.setItem.bind(originalStorage);
            originalStorage.setItem = function (key: string, value: string) {
                originalSetItem(key, value);

                // If it's a PKCE-related key, also set as cookie
                if (key.includes('code-verifier') || key.includes('code_verifier') || key.includes('auth-code-verifier')) {
                    const isSecure = window.location.protocol === 'https:';
                    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
                    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
                    const cookieName = projectRef ? `sb-${projectRef}-auth-code-verifier` : key;
                    const cookieString = `${cookieName}=${value}; path=/; SameSite=Lax; ${isSecure ? 'Secure;' : ''} max-age=600`;
                    document.cookie = cookieString;
                    console.log('🍪 Intercepted client.storage.setItem -> cookie:', { key, cookieName, valueLength: value.length });
                }
            };
        }
    }

    return client;
}
