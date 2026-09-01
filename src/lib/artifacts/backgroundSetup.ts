import type { SupabaseClient } from '@supabase/supabase-js';
import { artifactsForTier } from './registry';
import type { LaunchTier } from '@/types/launches';

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

/**
 * Is there anything for a setup run to actually do?
 *
 * True when the launch is missing a row for an artifact its tier calls for, or
 * has a row with no document. Two reads and no Google calls, because its whole
 * job is to decide whether to pay for the slow path.
 */
export async function hasMissingDocs(
    launchId: string,
    admin: SupabaseClient
): Promise<boolean> {
    const { data: launch } = await admin
        .from('launch')
        .select('tier')
        .eq('id', launchId)
        .maybeSingle();

    const { data: rows, error } = await admin
        .from('launch_artifact')
        .select('artifact_type, doc_id')
        .eq('launch_id', launchId);

    // Unreadable (the migration may not be applied here): call it work to do and
    // let ensureLaunchArtifacts report the real reason.
    if (error) return true;

    const withDoc = new Set(
        ((rows ?? []) as Array<{ artifact_type: string; doc_id: string | null }>)
            .filter((r) => r.doc_id)
            .map((r) => r.artifact_type)
    );

    return artifactsForTier((launch?.tier as LaunchTier) ?? null).some(
        (def) => !withDoc.has(def.type)
    );
}
