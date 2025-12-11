"use client";

import { createClient } from "@/lib/supabase/client";

export function SignIn({
    provider,
    ...props
}: { provider?: "google" } & React.ComponentPropsWithRef<"button">) {
    const supabase = createClient();

    const handleSignIn = async () => {
        // Use the canonical app URL if configured, otherwise use current origin
        // This ensures PKCE cookies are set on the correct domain
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
        const redirectTo = `${appUrl}/auth/callback`;
        
        console.log('🔐 Initiating OAuth sign-in:', {
            appUrl,
            redirectTo,
            currentOrigin: window.location.origin,
            currentHost: window.location.host
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
            console.log('✅ OAuth URL generated, redirecting...');
            // The signInWithOAuth will redirect automatically, but we log for debugging
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
