/**
 * GET   /api/paprico/meetings/[id] — meeting detail.
 * PATCH /api/paprico/meetings/[id] — update date/chair/length/notes, or move
 *        status to held/closed (publishing goes through /publish). Capability:
 *        paprico.manage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requirePapricoReader, requirePapricoWriter } from '@/lib/paprico/apiHelpers';

export const dynamic = 'force-dynamic';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const auth = await requirePapricoReader();
    if ('response' in auth) return auth.response;
    const { id } = await params;

    const sb = createAdminClient();
    const { data, error } = await sb.from('paprico_meeting').select('*').eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    return NextResponse.json({ meeting: data });
}

const updateSchema = z.object({
    meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    chair_email: z.string().email().nullable().optional(),
    meeting_length_minutes: z.number().int().min(15).max(480).optional(),
    notes: z.string().max(20000).nullable().optional(),
    // draft -> agenda_published happens via /publish; held/closed are set here.
    status: z.enum(['held', 'closed']).optional(),
});

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const auth = await requirePapricoWriter();
    if ('response' in auth) return auth.response;
    const { id } = await params;

    const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }

    const sb = createAdminClient();
    const { data, error } = await sb
        .from('paprico_meeting')
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    return NextResponse.json({ meeting: data });
}
