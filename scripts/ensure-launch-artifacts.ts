#!/usr/bin/env tsx
/**
 * Create the artifact rows (and, where Google is configured, the Docs) for
 * launches that predate the feature.
 *
 * Idempotent: safe to re-run. Rows already carrying a doc_id are skipped, and
 * the Drive folder is checked before any copy, so a second run never produces a
 * duplicate of a document someone is editing.
 *
 * Usage:
 *   npx tsx scripts/ensure-launch-artifacts.ts            # all active launches
 *   npx tsx scripts/ensure-launch-artifacts.ts <launchId> # just one
 */
import 'dotenv/config';

/**
 * Settings reads inside the launch stack use the request-scoped Supabase client,
 * whose auth-recovery promise rejects outside a request. Nothing awaits it, so
 * it surfaces as an unhandled rejection and kills the process even though every
 * caller handles the failure. Swallow only that; anything else still crashes.
 */
process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    if (message.includes('was called outside a request scope')) return;
    console.error('\nUnhandled rejection:', message);
    process.exit(1);
});

import { createAdminClient } from '../src/lib/supabase/server';
import { ensureLaunchArtifacts } from '../src/lib/artifacts/docFactory';
import { isGoogleConfigured } from '../src/lib/google/auth';
import { ARTIFACT_LABEL, type ArtifactType } from '../src/types/artifacts';

(async () => {
    const only = process.argv[2];
    const supabase = createAdminClient();

    console.log(
        `\nGoogle: ${(await isGoogleConfigured()) ? 'configured' : 'NOT configured — rows will be created without documents'}\n`
    );

    let query = supabase.from('launch').select('id, name, tier').eq('archived', false);
    if (only) query = query.eq('id', only);

    const { data: launches, error } = await query;
    if (error) {
        console.error('Could not read launches:', error.message);
        process.exit(1);
    }
    if (!launches?.length) {
        console.log('No matching launches.');
        return;
    }

    for (const launch of launches as Array<{ id: string; name: string; tier: string | null }>) {
        console.log(`${launch.name} (${launch.tier ?? 'no tier'})`);
        const result = await ensureLaunchArtifacts(launch.id, supabase);
        console.log(
            `  rows created: ${result.created}   docs created: ${result.docsCreated}   skipped: ${result.skipped}`
        );
        for (const err of result.errors) console.log(`  ! ${err}`);

        // Show what landed, including whether each document found its readiness
        // row — an unlinked artifact is legal, so it fails silently otherwise.
        const { data: rows } = await supabase
            .from('launch_artifact')
            .select('artifact_type, status, owner_email, criterion_id, doc_url')
            .eq('launch_id', launch.id);

        for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
            const type = r.artifact_type as ArtifactType;
            console.log(
                `    ${ARTIFACT_LABEL[type].padEnd(22)} ${String(r.status).padEnd(12)} ` +
                `owner=${r.owner_email ?? '(none)'}  criterion=${r.criterion_id ? 'linked' : 'UNLINKED'}` +
                `${r.doc_url ? `  doc=${r.doc_url}` : ''}`
            );
        }
        console.log();
    }
})().catch((err) => {
    console.error('\nFailed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
