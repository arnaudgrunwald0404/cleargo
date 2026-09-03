/**
 * GET  /api/paprico/meetings — list meetings (newest first) + the next open meeting.
 * POST /api/paprico/meetings — create a meeting (capability: paprico.manage).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { requirePapricoReader, requirePapricoWriter } from '@/lib/paprico/apiHelpers';

export const dynamic = 'force-dynamic';

async function getHandler(): Promise<NextResponse> {
    const auth = await requirePapricoReader();
    if ('response' in auth) return auth.response;

    const sb = createAdminClient();
    const { data, error } = await sb
        .from('paprico_meeting')
        .select('*')
        .order('meeting_date', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const meetings = data ?? [];
    // The next meeting: the earliest still-open one (draft or agenda_published).
    const open = meetings
        .filter((m) => m.status === 'draft' || m.status === 'agenda_published')
        .sort((a, b) => String(a.meeting_date).localeCompare(String(b.meeting_date)));
    return NextResponse.json({ meetings, next_meeting_id: open[0]?.id ?? null });
}

const createSchema = z.object({
    meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    chair_email: z.string().email().nullable().optional(),
    meeting_length_minutes: z.number().int().min(15).max(480).optional(),
    notes: z.string().max(20000).nullable().optional(),
});

async function postHandler(req: NextRequest): Promise<NextResponse> {
    const auth = await requirePapricoWriter();
    if ('response' in auth) return auth.response;

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }

    const sb = createAdminClient();
    const { data, error } = await sb
        .from('paprico_meeting')
        .insert({
            meeting_date: parsed.data.meeting_date,
            chair_email: parsed.data.chair_email ?? auth.email,
            meeting_length_minutes: parsed.data.meeting_length_minutes ?? 60,
            notes: parsed.data.notes ?? null,
            created_by: auth.email,
        })
        .select('*')
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ meeting: data }, { status: 201 });
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
