"use client";

import { createClient } from "@/lib/supabase/client";

export function SignIn({
    provider,
    ...props
}: { provider?: "google" } & React.ComponentPropsWithRef<"button">) {
    const supabase = createClient();

    const handleSignIn = async () => {
        await supabase.auth.signInWithOAuth({
            provider: provider || "google",
            options: {
                redirectTo: `${location.origin}/auth/callback`,
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
    const supabase = createClient();

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        window.location.reload();
    };

    return (
        <button onClick={handleSignOut} {...props}>
            Sign Out
        </button>
    );
}
