import { redirect } from 'next/navigation';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';

/**
 * Server-side auth gate for pages.
 *
 * Runs in the Node server (same cookie view as route handlers), so it is not
 * affected by whether Next's `proxy.ts` executes on the host. Netlify currently
 * builds with NEXT_DISABLE_NETLIFY_EDGE=true, which stops `src/proxy.ts` from
 * running in production — gating must therefore live here, not there.
 *
 * Call from a segment `layout.tsx` so it covers every page beneath it,
 * including client components.
 *
 * @param redirectTo Path to return to after login.
 * @returns The authenticated user's email.
 */
export async function requirePageAuth(redirectTo?: string): Promise<string> {
    const email = await getAuthenticatedUserEmail();

    if (!email) {
        const loginUrl = redirectTo
            ? `/login?redirect=${encodeURIComponent(redirectTo)}`
            : '/login';
        redirect(loginUrl);
    }

    return email;
}
