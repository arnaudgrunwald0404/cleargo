"use client";

import { createClient } from "@/lib/supabase/client";

export function SignIn({
    provider,
    ...props
}: { provider?: "google" } & React.ComponentPropsWithRef<"button">) {
    const supabase = createClient();

    const handleSignIn = async () => {
        const redirectTo = `${window.location.origin}/auth/callback`;

        console.log('🔐 Starting OAuth sign-in:', {
            provider: provider || "google",
            redirectTo,
            currentOrigin: window.location.origin,
        });

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: provider || "google",
            options: {
                redirectTo,
                queryParams: {
                    prompt: 'select_account',
                },
            },
        });

        if (error) {
            console.error('OAuth sign-in error:', error);
        } else if (data?.url) {
            console.log('✅ OAuth URL generated, redirecting...');
            // Check if code_verifier cookie exists before redirect
            const cookies = document.cookie.split(';').reduce((acc, cookie) => {
                const [name, ...rest] = cookie.trim().split('=');
                acc[name] = decodeURIComponent(rest.join('='));
                return acc;
            }, {} as Record<string, string>);
            
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
            const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
            const codeVerifierCookieName = projectRef ? `sb-${projectRef}-auth-code-verifier` : null;
            
            if (codeVerifierCookieName && cookies[codeVerifierCookieName]) {
                console.log('✅ Code verifier cookie found before redirect:', codeVerifierCookieName);
            } else {
                console.error('❌ Code verifier cookie NOT found before redirect!', {
                    expectedName: codeVerifierCookieName,
                    allCookies: Object.keys(cookies),
                });
            }
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
            window.location.href = '/login';
        }
    };

    return (
        <button onClick={handleSignOut} {...props}>
            Sign Out
        </button>
    );
}
