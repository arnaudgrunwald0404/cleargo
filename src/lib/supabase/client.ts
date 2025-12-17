import { createBrowserClient } from '@supabase/ssr';

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
    // Supabase actually uses: sb-{project}-auth-token-code-verifier
    const codeVerifierCookieName = projectRef ? `sb-${projectRef}-auth-token-code-verifier` : null;

    Storage.prototype.setItem = function (key: string, value: string) {
      originalSetItem.call(this, key, value);

      // Log ALL localStorage writes to see what Supabase is storing
      if (
        key.includes('supabase') ||
        key.includes('auth') ||
        key.includes('code') ||
        key.includes('sb-')
      ) {
        console.log('🔍 localStorage.setItem intercepted:', {
          key,
          valueLength: value.length,
          valuePreview: value.substring(0, 20) + '...',
        });
      }

      // If it's a PKCE code_verifier, also store in cookie
      // Supabase might use different key formats, so check multiple patterns
      const isCodeVerifier =
        key.includes('code-verifier') ||
        key.includes('code_verifier') ||
        key.includes('auth-code-verifier') ||
        key.includes('auth_code_verifier') ||
        (key.startsWith('sb-') && key.includes('code')) ||
        (key.includes('sb-') && key.includes('verifier'));

      if (isCodeVerifier && codeVerifierCookieName) {
        const isSecure = window.location.protocol === 'https:';
        const isLocalhost =
          window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        // For OAuth redirects, we need SameSite=None with Secure for cross-site requests
        // But for same-site (Netlify), SameSite=Lax should work
        // Try SameSite=None first for maximum compatibility
        const sameSite = isSecure && !isLocalhost ? 'SameSite=None' : 'SameSite=Lax';
        const secureFlag = isSecure && !isLocalhost ? 'Secure;' : '';

        // Use the exact cookie name Supabase expects
        const cookieString = `${codeVerifierCookieName}=${encodeURIComponent(value)}; path=/; ${sameSite}; ${secureFlag} max-age=600`;
        document.cookie = cookieString;
        console.log('🍪 Intercepted localStorage.setItem -> cookie:', {
          localStorageKey: key,
          cookieName: codeVerifierCookieName,
          valueLength: value.length,
          cookieSet: true,
          currentDomain: window.location.hostname,
        });

        // Verify cookie was set
        const cookies = document.cookie.split(';').reduce(
          (acc, cookie) => {
            const [name, ...rest] = cookie.trim().split('=');
            acc[name] = decodeURIComponent(rest.join('='));
            return acc;
          },
          {} as Record<string, string>
        );

        if (cookies[codeVerifierCookieName]) {
          console.log('✅ Cookie verified after setting');
        } else {
          console.error('❌ Cookie NOT found after setting!', {
            expectedName: codeVerifierCookieName,
            allCookies: Object.keys(cookies),
          });
        }
      }
    };
  }

  // Use new publishable key, fallback to legacy anon key for backward compatibility
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!publishableKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables'
    );
  }

  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, publishableKey, {
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
        const cookies = document.cookie.split(';').reduce(
          (acc, cookie) => {
            const [name, ...rest] = cookie.trim().split('=');
            acc[name] = decodeURIComponent(rest.join('='));
            return acc;
          },
          {} as Record<string, string>
        );

        // Convert to array format expected by Supabase SSR
        const result = Object.entries(cookies).map(([name, value]) => ({ name, value }));

        // Log code_verifier access for debugging
        const codeVerifier = result.find(
          (c) => c.name.includes('code-verifier') || c.name.includes('code_verifier')
        );
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
            const isLocalhost =
              window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const secureFlag = isSecure && !isLocalhost ? 'Secure;' : '';

            // For code_verifier cookies, use SameSite=None for OAuth redirects
            // For other cookies, use the provided sameSite or default to Lax
            let sameSite = options?.sameSite || 'Lax';
            if (
              (name.includes('code-verifier') || name.includes('code_verifier')) &&
              isSecure &&
              !isLocalhost
            ) {
              sameSite = 'None'; // Required for cross-site OAuth redirects
            }

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
  });
}
