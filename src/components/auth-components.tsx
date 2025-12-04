"use client";

import { createClient } from "@/lib/supabase/client";

export function SignIn({
    provider,
    ...props
}: { provider?: "google" } & React.ComponentPropsWithRef<"button">) {
    const supabase = createClient();

    const handleSignIn = async () => {
        // If a canonical app URL is configured and differs from the current host,
        // first move the user to that host so the PKCE verifier cookie and callback
        // land on the same site. Otherwise the code_verifier won't be present on callback.
        const preferred = process.env.NEXT_PUBLIC_APP_URL;
        if (preferred) {
            try {
                const preferredHost = new URL(preferred).host;
                if (preferredHost && preferredHost !== window.location.host) {
                    const next = encodeURIComponent(window.location.href);
                    window.location.href = `${preferred}/login?next=${next}`;
                    return;
                }
            } catch {
                // ignore parse errors and fall back to current origin
            }
        }

        // Use current origin for callback to avoid cross-host cookie issues
        const redirectTo = `${window.location.origin}/auth/callback`;
        
        await supabase.auth.signInWithOAuth({
            provider: provider || "google",
            options: {
                redirectTo,
                queryParams: {
                    prompt: 'select_account',
                },
            },
        });
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
