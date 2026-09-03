/**
 * PATCH /api/paprico/decisions/[id] — decisions are append-only; the only
 * mutable field is completion (set when the commitment lands, spec §3).
 * Body: { completed: boolean }. Capability: paprico.manage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requirePapricoWriter } from '@/lib/paprico/apiHelpers';

export const dynamic = 'force-dynamic';

const completeSchema = z.object({ completed: z.boolean() });

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const auth = await requirePapricoWriter();
    if ('response' in auth) return auth.response;
    const { id } = await params;

    const parsed = completeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Decisions are append-only; only { completed } can change' },
            { status: 400 }
        );
    }

    const sb = createAdminClient();
    const { data, error } = await sb
        .from('paprico_decision')
        .update(
            parsed.data.completed
                ? { completed_at: new Date().toISOString(), completed_by: auth.email }
                : { completed_at: null, completed_by: null }
        )
        .eq('id', id)
        .select('*')
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    return NextResponse.json({ decision: data });
}
