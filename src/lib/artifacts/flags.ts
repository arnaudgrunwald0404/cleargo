/**
 * The interview queue for launch artifacts.
 *
 * A flag is something the generator wanted to assert and could not ground. That
 * set is precisely the set of things only a human knows, which makes it the
 * right thing to ask about — the agent never shows a blank template, it asks
 * the questions it already tried and failed to answer.
 *
 * THE BUG THIS FIXES: the equivalent epic-level machinery
 * (src/lib/story-brief/flags.ts) is fully implemented and unit-tested, but
 * `reconcileFlags` is called only from its own test file. Nothing in production
 * ever inserts a row, so `epic_story_brief_flag` is permanently empty and the
 * Slack "answer N open questions" button never has anything to offer. The read
 * path was built; the write path was not. `syncArtifactFlags` below is that
 * missing write path.
 *
 * The pure reconcile/identity algorithm is imported rather than reimplemented —
 * it is correct, tested, and independent of which table it writes to.
 */
import { createAdminClient } from '@/lib/supabase/server';
import {
    reconcileFlags,
    storyBriefFlagKey,
    pendingFlags,
    flagsClearedForRatification,
    type RawFlag,
} from '@/lib/story-brief/flags';
import type { ArtifactFlagStatus, LaunchArtifactFlag } from '@/types/artifacts';

export {
    reconcileFlags,
    pendingFlags,
    flagsClearedForRatification,
    /** Exported under a neutral name: the algorithm is not story-brief specific. */
    storyBriefFlagKey as artifactFlagKey,
};
export type { RawFlag };

type Supabase = ReturnType<typeof createAdminClient>;

/**
 * Persist a generation's flags against what is already on record.
 *
 * Insert new gaps, bump the generation on ones that persist, and leave answered
 * flags strictly alone. Stale flags are deliberately NOT deleted — the answer
 * stays useful if the gap returns in a later draft.
 */
export async function syncArtifactFlags(
    artifactId: string,
    fresh: RawFlag[],
    generation: number,
    supabase: Supabase = createAdminClient()
): Promise<{ inserted: number; touched: number; reappeared: number; retired: number }> {
    const { data: existingRows, error } = await supabase
        .from('launch_artifact_flag')
        .select('flag_key, status')
        .eq('launch_artifact_id', artifactId);

    if (error) {
        // A failed flag sync must not fail the draft — the document is the
        // deliverable, the interview is an enhancement on top of it.
        console.error('syncArtifactFlags: could not read existing flags', error);
        return { inserted: 0, touched: 0, reappeared: 0, retired: 0 };
    }

    const existing = (existingRows ?? []) as Array<{ flag_key: string; status: ArtifactFlagStatus }>;
    const plan = reconcileFlags(fresh, existing, generation);

    if (plan.toInsert.length > 0) {
        const { error: insertError } = await supabase.from('launch_artifact_flag').insert(
            plan.toInsert.map((f) => ({
                launch_artifact_id: artifactId,
                flag_key: f.flag_key,
                section: f.section,
                claim: f.claim,
                question: buildQuestion(f.claim),
                status: 'open' as const,
                last_seen_generation: f.last_seen_generation,
            }))
        );
        if (insertError) console.error('syncArtifactFlags: insert failed', insertError);
    }

    // Bump generation on survivors. Individually rather than in one statement
    // because the set is small and a partial failure should not lose the rest.
    for (const f of plan.toTouch) {
        const { error: touchError } = await supabase
            .from('launch_artifact_flag')
            .update({ last_seen_generation: f.last_seen_generation, updated_at: new Date().toISOString() })
            .eq('launch_artifact_id', artifactId)
            .eq('flag_key', f.flag_key);
        if (touchError) console.error('syncArtifactFlags: touch failed', touchError);
    }

    // Retire questions this generation no longer asks.
    //
    // Without this the queue only grows: the model rewords its uncertainties on
    // every redraft, so "What workflows will agents augment?" and "What agent
    // use cases are prioritized?" hash differently and both stay open. A real
    // run went from 8 questions to 17 across two drafts, which is more than
    // anyone will answer.
    //
    // Deferred, not deleted: the wording is superseded, but the fact that it
    // was once asked is worth keeping, and an answered flag is never touched.
    if (plan.stale.length > 0) {
        const { error: staleError } = await supabase
            .from('launch_artifact_flag')
            .update({ status: 'deferred', updated_at: new Date().toISOString() })
            .eq('launch_artifact_id', artifactId)
            .in('flag_key', plan.stale)
            .in('status', ['open', 'asked']);
        if (staleError) console.error('syncArtifactFlags: stale update failed', staleError);
    }

    return {
        inserted: plan.toInsert.length,
        touched: plan.toTouch.length,
        reappeared: plan.reappeared.length,
        retired: plan.stale.length,
    };
}

/**
 * Turn an ungrounded claim into something a human can actually answer.
 *
 * The claim is phrased as an assertion the model could not support; asking it
 * back verbatim reads as an accusation. Prefixing turns it into a request to
 * confirm or correct, which is what we want from the owner.
 */
export function buildQuestion(claim: string): string {
    const trimmed = claim.trim().replace(/\s+/g, ' ');
    if (trimmed.endsWith('?')) return trimmed;
    return `Can you confirm or correct this? "${trimmed}"`;
}

export interface ArtifactInterview {
    artifactId: string;
    launchId: string;
    launchName: string;
    artifactType: string;
    flags: LaunchArtifactFlag[];
}

/** Everything still waiting on a human for one artifact, oldest first. */
export async function loadArtifactInterview(
    artifactId: string,
    supabase: Supabase = createAdminClient()
): Promise<ArtifactInterview | null> {
    const { data: artifact, error } = await supabase
        .from('launch_artifact')
        .select('id, launch_id, artifact_type, launch:launch(name)')
        .eq('id', artifactId)
        .single();

    if (error || !artifact) return null;

    const { data: flags } = await supabase
        .from('launch_artifact_flag')
        .select('*')
        .eq('launch_artifact_id', artifactId)
        .in('status', ['open', 'asked'])
        .order('created_at', { ascending: true });

    const launch = artifact.launch as unknown as { name?: string } | null;

    return {
        artifactId: artifact.id as string,
        launchId: artifact.launch_id as string,
        launchName: launch?.name ?? 'Launch',
        artifactType: artifact.artifact_type as string,
        flags: (flags ?? []) as LaunchArtifactFlag[],
    };
}

/**
 * Mark the shown slice as asked. Guarded on status='open' so re-opening the
 * modal does not churn asked_at and reshuffle the queue.
 */
export async function markArtifactFlagsAsked(
    flagIds: string[],
    supabase: Supabase = createAdminClient()
): Promise<void> {
    if (flagIds.length === 0) return;
    const { error } = await supabase
        .from('launch_artifact_flag')
        .update({ status: 'asked', asked_at: new Date().toISOString() })
        .in('id', flagIds)
        .eq('status', 'open');
    if (error) console.error('markArtifactFlagsAsked failed', error);
}

/**
 * Record answers from the Slack modal.
 *
 * Each update is scoped by BOTH the flag id and the artifact id, so a crafted
 * submission carrying someone else's flag id cannot write onto another launch's
 * interview.
 */
export async function recordArtifactFlagAnswers(
    artifactId: string,
    answers: Record<string, string>,
    answeredBy: string,
    supabase: Supabase = createAdminClient()
): Promise<{ saved: number; remaining: number }> {
    let saved = 0;
    const now = new Date().toISOString();

    for (const [flagId, answer] of Object.entries(answers)) {
        const trimmed = answer?.trim();
        if (!trimmed) continue; // A blank is a skip, not an answer.

        const { error } = await supabase
            .from('launch_artifact_flag')
            .update({
                answer: trimmed,
                status: 'answered',
                answered_at: now,
                answered_by: answeredBy,
                updated_at: now,
            })
            .eq('id', flagId)
            .eq('launch_artifact_id', artifactId);

        if (error) console.error('recordArtifactFlagAnswers failed for flag', flagId, error);
        else saved += 1;
    }

    const { count } = await supabase
        .from('launch_artifact_flag')
        .select('id', { count: 'exact', head: true })
        .eq('launch_artifact_id', artifactId)
        .in('status', ['open', 'asked']);

    return { saved, remaining: count ?? 0 };
}

/**
 * Answered flags, rendered for the next draft's prompt. This is what closes the
 * loop: a question the PM answered in Slack becomes grounding material rather
 * than being asked again.
 */
export async function renderAnsweredFlagsForPrompt(
    artifactId: string,
    supabase: Supabase = createAdminClient()
): Promise<string> {
    const { data } = await supabase
        .from('launch_artifact_flag')
        .select('section, claim, answer')
        .eq('launch_artifact_id', artifactId)
        .eq('status', 'answered');

    const rows = (data ?? []) as Array<{ section: string; claim: string; answer: string | null }>;
    if (rows.length === 0) return '';

    return rows
        .map((r) => `- [${r.section}] Asked: "${r.claim}"\n  Owner answered: ${r.answer}`)
        .join('\n');
}
