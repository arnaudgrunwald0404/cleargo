#!/usr/bin/env tsx
/**
 * Draft one launch artifact and print it, without persisting anything.
 *
 * Exercises the real pipeline — Aha/Jira delivery validation, ClearGO comment
 * and transcript harvest, the schema-constrained LLM call, and the grounding
 * pass — against a real launch. Deliberately writes nothing: the launch_artifact
 * table may not exist yet, and the point here is to see whether the DRAFT is any
 * good, separately from whether persistence works.
 *
 * Usage:
 *   npx tsx scripts/draft-launch-artifact.ts                 # list launches
 *   npx tsx scripts/draft-launch-artifact.ts <launchId> [type]
 *
 * type defaults to story_brief.
 */
import 'dotenv/config';

/**
 * Settings reads inside the Jira client use the request-scoped Supabase client,
 * whose auth-recovery promise rejects with "cookies was called outside a request
 * scope" when run from a CLI. Nothing awaits that promise, so it surfaces as an
 * unhandled rejection and Node kills the process — even though the failure is
 * caught and handled everywhere it actually matters.
 *
 * Swallow only that specific rejection; anything else still crashes the script,
 * which is what we want.
 */
process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    if (message.includes('was called outside a request scope')) return;
    console.error('\nUnhandled rejection:', message);
    process.exit(1);
});

import { createAdminClient } from '../src/lib/supabase/server';
import { assembleLaunchContext, renderLaunchFacts } from '../src/lib/artifacts/context';
import { generateArtifact } from '../src/lib/artifacts/generator';
import { getArtifactDefinition } from '../src/lib/artifacts/registry';
import { ARTIFACT_TYPES, type ArtifactType } from '../src/types/artifacts';

async function listLaunches(): Promise<void> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('launch')
        .select('id, name, tier, status, target_launch_date, archived, launch_epic(epic_id)')
        .eq('archived', false)
        .order('target_launch_date', { ascending: true });

    if (error) {
        console.error('Could not read launches:', error.message);
        process.exit(1);
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) {
        console.log('No active launches. Create one at /gtm-launches first.');
        return;
    }

    console.log(`\n${rows.length} active launch(es):\n`);
    for (const l of rows) {
        const epics = (l.launch_epic as unknown[] | null)?.length ?? 0;
        // Epic count is the number that matters: a launch with no epics has
        // nothing for the delivery validator to check, so its draft will be
        // almost entirely ungrounded.
        console.log(
            `  ${l.id}  ${String(l.name).padEnd(34)} ${String(l.tier ?? '-').padEnd(8)} ` +
            `${String(l.target_launch_date ?? 'no date').padEnd(12)} ${epics} epic(s)`
        );
    }
    console.log('\nRun again with a launch id to draft.\n');
}

async function draft(launchId: string, type: ArtifactType): Promise<void> {
    const def = getArtifactDefinition(type);
    console.log(`\nDrafting ${def.label} for launch ${launchId}\n`);

    console.log('1. Assembling grounding context (Aha + Jira per epic, ClearGO history)...');
    const context = await assembleLaunchContext(launchId);
    console.log(renderLaunchFacts(context).split('\n').map((l) => `   ${l}`).join('\n'));
    console.log(
        `\n   ClearGO history: ${context.harvest.comments.length} comment(s), ` +
        `${context.harvest.transcripts.length} transcript(s)`
    );

    console.log('\n2. Drafting...');
    const started = Date.now();
    const result = await generateArtifact({ launchId, artifactType: type });
    console.log(`   done in ${Math.round((Date.now() - started) / 1000)}s`);

    console.log('\n3. Draft\n');
    console.log(JSON.stringify(result.output, null, 2));

    console.log(`\n4. Open questions for the owner (${result.flags.length})\n`);
    if (result.flags.length === 0) {
        console.log('   none — everything the model asserted was grounded.');
    } else {
        for (const f of result.flags) {
            console.log(`   [${f.section}] ${f.claim}`);
        }
    }

    console.log(`\n   confidence: ${(result.output as { overall_confidence?: string }).overall_confidence}\n`);
}

(async () => {
    const [launchId, rawType] = process.argv.slice(2);

    if (!launchId) {
        await listLaunches();
        return;
    }

    const type = (rawType ?? 'story_brief') as ArtifactType;
    if (!ARTIFACT_TYPES.includes(type)) {
        console.error(`Unknown artifact type "${type}". One of: ${ARTIFACT_TYPES.join(', ')}`);
        process.exit(1);
    }

    await draft(launchId, type);
})().catch((err) => {
    console.error('\nFailed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
