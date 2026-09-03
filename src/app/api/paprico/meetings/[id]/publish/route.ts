/**
 * POST /api/paprico/meetings/[id]/publish
 *
 * Chair action, available in draft (spec §5.2): freezes the computed agenda
 * into agenda_snapshot, sets status = agenda_published, and returns the
 * copyable Slack-formatted block for #paprico. Capability: paprico.manage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requirePapricoWriter } from '@/lib/paprico/apiHelpers';
import { computeAgendaForMeeting } from '@/lib/paprico/agendaService';
import { buildSlackAgendaBlock } from '@/lib/paprico/format';
import type { PapricoMeeting } from '@/lib/paprico/types';

export const dynamic = 'force-dynamic';

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const auth = await requirePapricoWriter();
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
    if ((meeting as PapricoMeeting).status !== 'draft') {
        return NextResponse.json({ error: 'Only a draft meeting can publish its agenda' }, { status: 409 });
    }

    try {
        const agenda = await computeAgendaForMeeting(sb, meeting as PapricoMeeting);
        const publishedAt = new Date().toISOString();
        const { data: updated, error: updErr } = await sb
            .from('paprico_meeting')
            .update({
                status: 'agenda_published',
                agenda_snapshot: agenda,
                agenda_published_at: publishedAt,
                updated_at: publishedAt,
            })
            .eq('id', id)
            .eq('status', 'draft')
            .select('*')
            .maybeSingle();
        if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
        if (!updated) {
            return NextResponse.json({ error: 'Meeting was published concurrently' }, { status: 409 });
        }

        const slackBlock = buildSlackAgendaBlock(updated as PapricoMeeting, agenda);
        return NextResponse.json({ meeting: updated, agenda, slack_block: slackBlock });
    } catch (err) {
        console.error('PaPriCo publish failed:', err);
        return NextResponse.json({ error: 'Failed to publish agenda' }, { status: 500 });
    }
}
