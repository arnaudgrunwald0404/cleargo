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
import { publishMeetingAgenda } from '@/lib/paprico/publishAgenda';

export const dynamic = 'force-dynamic';

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const auth = await requirePapricoWriter();
    if ('response' in auth) return auth.response;
    const { id } = await params;

    const result = await publishMeetingAgenda(createAdminClient(), id);

    if (result.outcome === 'not_found') {
        return NextResponse.json({ error: result.reason }, { status: 404 });
    }
    if (result.outcome === 'conflict') {
        return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    if (result.outcome === 'failed') {
        return NextResponse.json({ error: result.reason }, { status: 500 });
    }

    return NextResponse.json({
        meeting: result.meeting,
        agenda: result.agenda,
        slack_block: result.slackBlock,
    });
}
