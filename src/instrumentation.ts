/**
 * Next.js startup hook.
 *
 * Runs once per server process, before any request is handled -- the only place
 * a configuration check can happen early enough to be useful.
 */
export async function register(): Promise<void> {
    // Node runtime only. The edge runtime has no meaningful process.env to scan
    // and this would run again per isolate.
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    const { reportEnvNameNearMisses } = await import('@/lib/env/near-miss');
    reportEnvNameNearMisses();
}
