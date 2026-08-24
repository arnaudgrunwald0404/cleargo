/**
 * GET   /api/paprico/items/[id] — item detail: linked epic/criterion context and
 *        the full append-only decision history (supersedes chain included).
 * PATCH /api/paprico/items/[id] — edit fields / change status. Enforces:
 *        - status=decided requires at least one decision row (acceptance #6)
 *        - status=blocked requires blocked_reason
 *        Capability: paprico.manage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requirePapricoReader, requirePapricoWriter } from '@/lib/paprico/apiHelpers';
import type { PapricoItem } from '@/lib/paprico/types';

export const dynamic = 'force-dynamic';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const auth = await requirePapricoReader();
    if ('response' in auth) return auth.response;
    const { id } = await params;

    const sb = createAdminClient();
    const { data: item, error } = await sb.from('paprico_item').select('*').eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const typedItem = item as PapricoItem;
    const [epicRes, criterionRes, decisionsRes] = await Promise.all([
        typedItem.epic_id
            ? sb.from('epic').select('id, name, tier, status').eq('id', typedItem.epic_id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        typedItem.criterion_id
            ? sb.from('criterion').select('id, label, category, is_active').eq('id', typedItem.criterion_id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        sb
            .from('paprico_decision')
            .select('*, meeting:paprico_meeting(meeting_date)')
            .eq('item_id', id)
            .order('decided_at', { ascending: true }),
    ]);
    if (decisionsRes.error) return NextResponse.json({ error: decisionsRes.error.message }, { status: 500 });

    return NextResponse.json({
        item,
        epic: epicRes.data ?? null,
        criterion: criterionRes.data ?? null,
        // The linked epic/criterion may have been deleted; the item still renders (spec §6).
        orphaned:
            typedItem.source === 'release' &&
            ((!!typedItem.epic_id && !epicRes.data) || (!!typedItem.criterion_id && !criterionRes.data)),
        decisions: decisionsRes.data ?? [],
    });
}

const linkSchema = z.object({ label: z.string().min(1).max(200), url: z.string().url() });

const updateSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(20000).nullable().optional(),
    category: z.string().max(100).nullable().optional(),
    owner_email: z.string().email().nullable().optional(),
    status: z.enum(['proposed', 'on_agenda', 'decided', 'deferred', 'blocked', 'closed']).optional(),
    blocked_reason: z.string().max(2000).nullable().optional(),
    time_box_minutes: z.number().int().min(1).max(480).nullable().optional(),
    sort_order: z.number().int().optional(),
    links: z.array(linkSchema).max(20).nullable().optional(),
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
    const updates = parsed.data;

    const sb = createAdminClient();
    const { data: existing, error: readErr } = await sb
        .from('paprico_item')
        .select('id, status, blocked_reason')
        .eq('id', id)
        .maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    if (updates.status === 'blocked') {
        const reason = updates.blocked_reason ?? (existing as { blocked_reason: string | null }).blocked_reason;
        if (!reason?.trim()) {
            return NextResponse.json({ error: 'A blocked item requires a blocked_reason' }, { status: 400 });
        }
    }

    if (updates.status === 'decided') {
        const { count, error: countErr } = await sb
            .from('paprico_decision')
            .select('id', { count: 'exact', head: true })
            .eq('item_id', id);
        if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
        if (!count) {
            return NextResponse.json(
                { error: 'An item cannot be marked decided without at least one recorded decision' },
                { status: 400 }
            );
        }
    }

    const { data, error } = await sb
        .from('paprico_item')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
}
