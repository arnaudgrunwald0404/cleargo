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
        
        console.log('🔐 Initiating OAuth sign-in:', {
            redirectTo,
            currentOrigin: window.location.origin,
            currentHost: window.location.host,
            appUrl: process.env.NEXT_PUBLIC_APP_URL
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
