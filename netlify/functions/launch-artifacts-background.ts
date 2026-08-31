/**
 * Netlify Background Function: set up one launch's artifact rows and Google Docs.
 *
 * Invoked by POST /api/launches (on create) and by POST /api/launches/[id]/artifacts
 * { action: 'ensure' }. For a Tier 1/2 launch, ensureLaunchArtifacts makes roughly
 * twenty sequential Google calls -- a folder list and create, then per artifact a
 * folder list, a Drive copy, a Docs batchUpdate and a permission grant, five
 * artifacts deep. netlify.toml caps a SYNCHRONOUS function at 26s, and a proxy in
 * front of the site cuts an idle connection sooner than that.
 *
 * Running it inline is what produced the bug this file fixes: the launch, its
 * criteria, its folder and its documents were all created, and then the response
 * was lost, so the UI reported a failure for work that had entirely succeeded.
 *
 * There is no job table, and unlike drafting there is no row to claim either --
 * `launch_artifact` rows are what this function creates. That is fine because
 * ensureLaunchArtifacts is idempotent twice over (the UNIQUE(launch_id,
 * artifact_type) row, and a filename match against the Drive folder), so the
 * panel's "Create missing documents" button is the retry for anything missed.
 *
 * Env: NETLIFY_ARTIFACT_DRAFT_SECRET (falls back to NETLIFY_HEART_SETUP_SECRET).
 */

import { createClient } from '@supabase/supabase-js';
import { setOverrideAdminClient } from '../../src/lib/db';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;

interface Body {
    launchId: string;
    secret?: string;
}

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

const handler = async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let body: Body;
    try {
        body = (await req.json()) as Body;
    } catch {
        return json({ error: 'Invalid JSON body' }, 400);
    }

    const { launchId, secret } = body;

    const expectedSecret =
        process.env.NETLIFY_ARTIFACT_DRAFT_SECRET || process.env.NETLIFY_HEART_SETUP_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
        return json({ error: 'Unauthorized' }, 401);
    }

    if (!launchId) {
        return json({ error: 'Missing launchId' }, 400);
    }

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
        return json({ error: 'Server configuration error' }, 500);
    }

    const adminClient = createClient(supabaseUrl, supabaseKey);
    // Covers anything reached through getAdminClient() in src/lib/db. The doc
    // factory itself calls createAdminClient() from src/lib/supabase/server,
    // which builds its own client from env and works here; this is for the
    // transitive consumers (settings, Slack).
    setOverrideAdminClient(adminClient);

    try {
        // Imported HERE, not at module scope, so a failure to LOAD the factory is
        // caught below and logged. Netlify answers a background invocation with
        // 202 immediately, so a module-load crash is otherwise completely
        // invisible: the launch just never grows any documents and nothing
        // anywhere says why.
        const { ensureLaunchArtifacts } = await import('../../src/lib/artifacts/docFactory');

        const result = await ensureLaunchArtifacts(launchId, adminClient as never);

        console.log(
            `[launch-artifacts] ${launchId}: ${result.created} row(s), ` +
                `${result.docsCreated} doc(s), ${result.skipped} skipped, ` +
                `google ${result.googleConfigured ? 'configured' : 'not configured'}` +
                (result.errors.length > 0 ? ` -- errors: ${result.errors.join('; ')}` : '')
        );

        return json({ ok: true, ...result }, 200);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Nothing to roll back: partial progress is exactly what the next
        // ensure run is designed to complete.
        console.error(`[launch-artifacts] ${launchId} failed:`, message);
        return json({ ok: false, error: message }, 500);
    }
};

export default handler;
