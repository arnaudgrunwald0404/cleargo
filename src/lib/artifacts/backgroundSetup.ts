/**
 * Handing launch artifact setup to the background function.
 *
 * Two routes need this -- POST /api/launches (on create) and POST
 * /api/launches/[id]/artifacts { action: 'ensure' } -- and they must agree
 * exactly on when to hand off, because the consequence of disagreeing is a
 * timeout that only happens in production.
 *
 * The predicate matches the drafting handoff in
 * src/app/api/launches/[id]/artifacts/route.ts: a Netlify base URL, not
 * localhost, and a secret to authenticate with. When any of those is missing
 * the caller runs ensureLaunchArtifacts inline, which is right for local dev --
 * there is no 26s function cap in front of `next dev`.
 */

/** Netlify target for the handoff, or null when it should run inline. */
export function launchArtifactSetupTarget(): { baseUrl: string; secret: string } | null {
    const baseUrl = (process.env.NETLIFY_URL || process.env.URL || '').replace(/\/$/, '');
    const secret =
        process.env.NETLIFY_ARTIFACT_DRAFT_SECRET || process.env.NETLIFY_HEART_SETUP_SECRET;

    if (!baseUrl || baseUrl.includes('localhost') || !secret) return null;
    return { baseUrl, secret };
}

/**
 * Start the background setup. Returns false when nothing is going to run.
 *
 * Deliberately non-throwing. Unlike drafting there is no row claimed ahead of
 * the dispatch, so a failure here strands nothing: the launch exists, and the
 * panel's "Create missing documents" button re-runs the same idempotent work.
 */
export async function dispatchLaunchArtifactSetup(
    launchId: string,
    target: { baseUrl: string; secret: string }
): Promise<boolean> {
    const res = await fetch(`${target.baseUrl}/.netlify/functions/launch-artifacts-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ launchId, secret: target.secret }),
    }).catch((err) => {
        console.error('[launch-artifacts] background trigger failed:', err);
        return null;
    });

    if (!res?.ok) {
        if (res) {
            console.error(
                `[launch-artifacts] background trigger returned ${res.status} for ${launchId}`
            );
        }
        return false;
    }

    return true;
}
