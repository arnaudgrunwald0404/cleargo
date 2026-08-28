#!/usr/bin/env tsx
/**
 * Run a real drafting cycle against a launch and persist it.
 * Usage: npx tsx scripts/draft-and-save.ts <launchId> [artifactType]
 */
import 'dotenv/config';

process.on('unhandledRejection', (reason) => {
    const m = reason instanceof Error ? reason.message : String(reason);
    if (m.includes('was called outside a request scope')) return;
    console.error('\nUnhandled rejection:', m);
    process.exit(1);
});

import { createAdminClient } from '../src/lib/supabase/server';
import { draftArtifact } from '../src/lib/artifacts/draftService';
import type { ArtifactType } from '../src/types/artifacts';

(async () => {
    const [launchId, type = 'story_brief'] = process.argv.slice(2);
    const supabase = createAdminClient();

    // Notification is OPT-IN here: this script is run by hand, and a stray run
    // should never DM a colleague asking them to review something.
    const notify = process.argv.includes('--notify');
    const r = await draftArtifact(launchId, type as ArtifactType, { notify }, supabase);
    if (!notify) console.log('(Slack review request suppressed — pass --notify to send it)');
    console.log(`\nstatus:        ${r.status}`);
    console.log(`generation:    ${r.artifact.generation}`);
    console.log(`doc updated:   ${r.docUpdated}`);
    console.log(`flags raised:  ${r.flagsRaised}`);
    for (const w of r.warnings) console.log(`warning:       ${w}`);

    const { data: flags } = await supabase
        .from('launch_artifact_flag')
        .select('section, question, status')
        .eq('launch_artifact_id', r.artifact.id)
        .order('created_at');
    console.log(`\ninterview queue (${(flags ?? []).length}):`);
    for (const f of (flags ?? []) as Array<Record<string, string>>) {
        console.log(`  [${f.status}] ${f.section}: ${String(f.question).slice(0, 88)}`);
    }
})().catch((e) => { console.error('\nFailed:', e instanceof Error ? e.message : e); process.exit(1); });
