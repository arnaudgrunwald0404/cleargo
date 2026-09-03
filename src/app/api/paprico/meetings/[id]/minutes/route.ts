/**
 * GET /api/paprico/meetings/[id]/minutes
 *
 * Minutes for a held (or closed) meeting (spec §5.5): decisions taken with
 * owner and due date, items deferred and why, items blocked and on what, and
 * commitments still open from prior meetings. Returned as markdown.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requirePapricoReader } from '@/lib/paprico/apiHelpers';
import { commitmentAgeDays, PAPRICO_TIMEZONE } from '@/lib/paprico/agenda';
import { buildMinutesMarkdown } from '@/lib/paprico/format';
import { getCalendarDateStringInTimeZone } from '@/lib/date-utils';
import type { OpenCommitment, PapricoDecision, PapricoMeeting } from '@/lib/paprico/types';

export const dynamic = 'force-dynamic';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const auth = await requirePapricoReader();
    if ('response' in auth) return auth.response;
    const { id } = await params;

    const sb = createAdminClient();
    const { data: meeting, error } = await sb
        .from('paprico_meeting')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    const typedMeeting = meeting as PapricoMeeting;
    if (typedMeeting.status !== 'held' && typedMeeting.status !== 'closed') {
        return NextResponse.json(
            { error: 'Minutes are generated for a held meeting — mark the meeting as held first' },
            { status: 409 }
        );
    }

    const today = getCalendarDateStringInTimeZone(PAPRICO_TIMEZONE);

    const [{ data: decisionRows, error: decErr }, { data: priorOpenRows, error: openErr }] = await Promise.all([
        sb
            .from('paprico_decision')
            .select('*, item:paprico_item(title, status, blocked_reason)')
            .eq('meeting_id', id)
            .order('decided_at', { ascending: true }),
        sb
            .from('paprico_decision')
            .select('*, item:paprico_item(title)')
            .neq('meeting_id', id)
            .is('completed_at', null)
            .not('owner_email', 'is', null)
            .not('due_date', 'is', null)
            .order('due_date', { ascending: true }),
    ]);
    if (decErr) return NextResponse.json({ error: decErr.message }, { status: 500 });
    if (openErr) return NextResponse.json({ error: openErr.message }, { status: 500 });

    type DecisionWithItem = PapricoDecision & {
        item: { title: string; status: string; blocked_reason: string | null } | null;
    };
    const decisions = (decisionRows ?? []) as DecisionWithItem[];

    const deferredItems = decisions
        .filter((d) => d.decision_type === 'deferred')
        .map((d) => ({ title: d.item?.title ?? '(item)', reason: d.decision_text }));

    // Items currently blocked among those touched in this meeting.
    const blockedSeen = new Set<string>();
    const blockedItems = decisions
        .filter((d) => d.item?.status === 'blocked' && !blockedSeen.has(d.item_id) && blockedSeen.add(d.item_id))
        .map((d) => ({ title: d.item?.title ?? '(item)', blocked_reason: d.item?.blocked_reason ?? null }));

    const openCommitments: OpenCommitment[] = ((priorOpenRows ?? []) as Array<
        PapricoDecision & { item: { title: string } | null }
    >).map(({ item, ...decision }) => ({
        ...decision,
        item_title: item?.title ?? null,
        age_days: commitmentAgeDays(decision.due_date, today),
    }));

    const markdown = buildMinutesMarkdown({
        meeting: typedMeeting,
        decisions: decisions.map(({ item, ...d }) => ({ ...d, item_title: item?.title ?? null })),
        deferredItems,
        blockedItems,
        openCommitments,
    });

    return NextResponse.json({ meeting, markdown });
}
