/**
 * Server side of the gap-only interview: which questions are still open, and
 * what to do with an answer.
 *
 * The rule that matters is in flags.ts and holds here too: an answered flag is
 * never re-asked and never deleted. A regeneration that raises the same gap
 * finds the answer already on record.
 */

import { createAdminClient } from '@/lib/supabase/server';
import type { InterviewFlag, InterviewTarget } from '@/lib/slack/templates/story-brief-interview';

export interface OpenInterview {
    target: InterviewTarget;
    flags: InterviewFlag[];
}

/**
 * Everything still waiting on a human for one brief, oldest first — the same
 * order as the idx_esb_flag_open work queue, so the questions a PM sees are the
 * ones that have been outstanding longest.
 */
export async function loadOpenInterview(
    briefId: string,
    supabase = createAdminClient()
): Promise<OpenInterview | null> {
    const { data: brief, error: briefError } = await supabase
        .from('epic_story_brief')
        .select('id, epic_id, epic:epic(name)')
        .eq('id', briefId)
        .maybeSingle();

    if (briefError || !brief) {
        if (briefError) console.error('loadOpenInterview: brief lookup failed', briefError.message);
        return null;
    }

    const { data: flagRows, error: flagError } = await supabase
        .from('epic_story_brief_flag')
        .select('id, section, claim, question, status')
        .eq('epic_story_brief_id', briefId)
        .in('status', ['open', 'asked'])
        .order('created_at', { ascending: true });

    if (flagError) {
        console.error('loadOpenInterview: flag lookup failed', flagError.message);
        return null;
    }

    const epicName =
        (brief as { epic?: { name?: string } | null }).epic?.name || 'this epic';

    return {
        target: {
            briefId: brief.id as string,
            epicId: brief.epic_id as string,
            epicName,
        },
        flags: (flagRows || []).map((f: Record<string, unknown>) => ({
            id: f.id as string,
            section: (f.section as string) || '',
            claim: (f.claim as string) || '',
            question: (f.question as string | null) ?? null,
        })),
    };
}

/** Mark the flags we are about to put in front of someone as asked. */
export async function markFlagsAsked(
    flagIds: string[],
    supabase = createAdminClient()
): Promise<void> {
    if (flagIds.length === 0) return;
    const { error } = await supabase
        .from('epic_story_brief_flag')
        .update({ status: 'asked', asked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .in('id', flagIds)
        .eq('status', 'open');
    if (error) console.error('markFlagsAsked failed', error.message);
}

export interface RecordAnswersResult {
    saved: number;
    remaining: number;
}

/**
 * Persist answers and report what is left.
 *
 * Scoped to the brief the modal was opened from, so a crafted submission cannot
 * write an answer onto another epic's flag. Blank inputs never reach here — the
 * parser drops them, because a skip is not an answer.
 */
export async function recordFlagAnswers(
    briefId: string,
    answers: Array<{ flagId: string; answer: string }>,
    answeredBy: string,
    supabase = createAdminClient()
): Promise<RecordAnswersResult> {
    const now = new Date().toISOString();
    let saved = 0;

    for (const { flagId, answer } of answers) {
        const { error } = await supabase
            .from('epic_story_brief_flag')
            .update({
                answer,
                status: 'answered',
                answered_at: now,
                answered_by: answeredBy,
                updated_at: now,
            })
            .eq('id', flagId)
            .eq('epic_story_brief_id', briefId);
        if (error) {
            console.error('recordFlagAnswers: update failed', flagId, error.message);
            continue;
        }
        saved++;
    }

    const { count } = await supabase
        .from('epic_story_brief_flag')
        .select('id', { count: 'exact', head: true })
        .eq('epic_story_brief_id', briefId)
        .in('status', ['open', 'asked']);

    return { saved, remaining: count ?? 0 };
}
