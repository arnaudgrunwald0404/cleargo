"use client";

import { createClient } from "@/lib/supabase/client";

export function SignIn({
    provider,
    ...props
}: { provider?: "google" } & React.ComponentPropsWithRef<"button">) {
    const supabase = createClient();

    const handleSignIn = async () => {
        // CRITICAL: Use current origin for redirectTo to ensure PKCE cookie is set on correct domain
        // The code_verifier cookie must be set on the same domain as the callback
        // Using window.location.origin ensures cookies are accessible when callback happens
        const redirectTo = `${window.location.origin}/auth/callback`;

        const cookiesBefore = document.cookie.split(';').map(c => c.trim().split('=')[0]);

        console.log('🔐 Initiating OAuth sign-in:', {
            redirectTo,
            currentOrigin: window.location.origin,
            currentHost: window.location.host,
            appUrl: process.env.NEXT_PUBLIC_APP_URL,
            cookiesBefore
        });

        // CRITICAL: Intercept ALL storage operations BEFORE calling signInWithOAuth
        // Supabase SSR might store the code_verifier immediately, so we need to catch it
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
        const codeVerifierCookieName = projectRef ? `sb-${projectRef}-auth-code-verifier` : null;

        // Set up a MutationObserver to watch for cookie changes
        let codeVerifierFound = false;
        const checkForCodeVerifier = () => {
            if (codeVerifierFound || !codeVerifierCookieName) return;

            // Check localStorage
            if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (key.includes('code-verifier') || key.includes('code_verifier') || key.includes('auth-code-verifier'))) {
                        const value = localStorage.getItem(key);
                        if (value) {
                            const isSecure = window.location.protocol === 'https:';
                            const cookieString = `${codeVerifierCookieName}=${value}; path=/; SameSite=Lax; ${isSecure ? 'Secure;' : ''} max-age=600`;
                            document.cookie = cookieString;
                            codeVerifierFound = true;
                            console.log('🍪 Found and copied PKCE code_verifier to cookie:', {
                                localStorageKey: key,
                                cookieName: codeVerifierCookieName,
                                valueLength: value.length,
                                currentDomain: window.location.hostname
                            });
                            return;
                        }
                    }
                }
            }

            // Check cookies directly
            const cookies = document.cookie.split(';').reduce((acc, cookie) => {
                const [name, ...rest] = cookie.trim().split('=');
                acc[name] = rest.join('=');
                return acc;
            }, {} as Record<string, string>);

            if (cookies[codeVerifierCookieName]) {
                codeVerifierFound = true;
                console.log('🍪 Code verifier cookie already exists:', codeVerifierCookieName);
            }
        };

        // Poll for code_verifier every 50ms for up to 2 seconds
        const pollInterval = setInterval(() => {
            checkForCodeVerifier();
        }, 50);

        const pollTimeout = setTimeout(() => {
            clearInterval(pollInterval);
            if (!codeVerifierFound) {
                console.warn('⚠️ Code verifier not found after 2 seconds');
            }
        }, 2000);

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: provider || "google",
            options: {
                redirectTo,
                queryParams: {
                    prompt: 'select_account',
                },
            },
        });

        // Immediately check for code_verifier after OAuth call
        checkForCodeVerifier();

        // Wait a bit more and check again
        await new Promise(resolve => setTimeout(resolve, 200));
        checkForCodeVerifier();

        // Clean up polling
        clearInterval(pollInterval);
        clearTimeout(pollTimeout);

        // Final check - scan all localStorage keys one more time
        if (!codeVerifierFound && typeof window !== 'undefined' && typeof localStorage !== 'undefined' && codeVerifierCookieName) {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) {
                    const value = localStorage.getItem(key);
                    // Check if this looks like a code_verifier (long random string)
                    if (value && value.length > 40 && (key.includes('auth') || key.includes('code'))) {
                        const isSecure = window.location.protocol === 'https:';
                        const cookieString = `${codeVerifierCookieName}=${value}; path=/; SameSite=Lax; ${isSecure ? 'Secure;' : ''} max-age=600`;
                        document.cookie = cookieString;
                        console.log('🍪 Final attempt - copied potential code_verifier to cookie:', {
                            localStorageKey: key,
                            cookieName: codeVerifierCookieName,
                            valueLength: value.length
                        });
                    }
                }
            }
        }

        // Check cookies after OAuth URL generation
        const cookiesAfter = document.cookie.split(';').map(c => c.trim().split('=')[0]);
        const newCookies = cookiesAfter.filter(c => !cookiesBefore.includes(c));
        const hasCodeVerifier = cookiesAfter.some(c => c === codeVerifierCookieName || c.includes('code-verifier'));
        console.log('🍪 Cookies after OAuth init:', {
            allCookies: cookiesAfter,
            newCookies: newCookies,
            hasCodeVerifier,
            codeVerifierCookieName,
            codeVerifierFound
        });

        if (error) {
            console.error('❌ OAuth sign-in error:', error);
        } else if (data?.url) {
            console.log('✅ OAuth URL generated, redirecting to:', data.url);
            // The signInWithOAuth will redirect automatically
        }
    };

    return (
        <button onClick={handleSignIn} {...props}>
            Sign In
        </button>
    );
}

export function SignOut(props: React.ComponentPropsWithRef<"button">) {
    const handleSignOut = async () => {
        try {
            await fetch('/auth/signout', { method: 'POST', credentials: 'include' });
        } finally {
            window.location.href = '/';
        }
    };

    return (
        <button onClick={handleSignOut} {...props}>
            Sign Out
        </button>
    );
}
