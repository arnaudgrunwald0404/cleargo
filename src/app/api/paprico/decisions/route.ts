/**
 * POST /api/paprico/decisions — append a decision (capability: paprico.manage).
 *
 * Decisions are append-only (spec §3): a change of mind is a new row with
 * supersedes_id set. Validation enforces the spec's core constraint — an
 * assigned/approved decision cannot be saved without an owner and a due date
 * (acceptance #7). Recording a decision moves the item to decided (or deferred
 * for a deferral), so an item is never decided without a decision row
 * (acceptance #6).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { requirePapricoWriter } from '@/lib/paprico/apiHelpers';
import { validateDecisionInput } from '@/lib/paprico/agenda';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
    item_id: z.string().uuid(),
    meeting_id: z.string().uuid(),
    decision_type: z.enum([
        'approved',
        'approved_with_amendment',
        'rejected',
        'deferred',
        'assigned',
        'no_decision_needed',
    ]),
    decision_text: z.string().min(1).max(5000),
    rationale: z.string().max(10000).nullable().optional(),
    owner_email: z.string().email().nullable().optional(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    supersedes_id: z.string().uuid().nullable().optional(),
});

async function postHandler(req: NextRequest): Promise<NextResponse> {
    const auth = await requirePapricoWriter();
    if ('response' in auth) return auth.response;

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    const validationError = validateDecisionInput(input);
    if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const sb = createAdminClient();
    const [{ data: item, error: itemErr }, { data: meeting, error: meetingErr }] = await Promise.all([
        sb.from('paprico_item').select('id, status').eq('id', input.item_id).maybeSingle(),
        sb.from('paprico_meeting').select('id, status').eq('id', input.meeting_id).maybeSingle(),
    ]);
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
    if (meetingErr) return NextResponse.json({ error: meetingErr.message }, { status: 500 });
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

    if (input.supersedes_id) {
        const { data: superseded } = await sb
            .from('paprico_decision')
            .select('id, item_id')
            .eq('id', input.supersedes_id)
            .maybeSingle();
        if (!superseded) {
            return NextResponse.json({ error: 'Superseded decision not found' }, { status: 404 });
        }
        if (superseded.item_id !== input.item_id) {
            return NextResponse.json(
                { error: 'A decision can only supersede a decision on the same item' },
                { status: 400 }
            );
        }
    }

    // Saves immediately on submit — the record is written while the room is
    // still in the meeting (spec §5.3).
    const { data: decision, error } = await sb
        .from('paprico_decision')
        .insert({
            item_id: input.item_id,
            meeting_id: input.meeting_id,
            decision_type: input.decision_type,
            decision_text: input.decision_text,
            rationale: input.rationale ?? null,
            owner_email: input.owner_email ?? null,
            due_date: input.due_date ?? null,
            supersedes_id: input.supersedes_id ?? null,
            decided_by: auth.email,
        })
        .select('*')
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const newItemStatus = input.decision_type === 'deferred' ? 'deferred' : 'decided';
    const { error: itemUpdErr } = await sb
        .from('paprico_item')
        .update({ status: newItemStatus, updated_at: new Date().toISOString() })
        .eq('id', input.item_id);
    if (itemUpdErr) {
        console.error('Decision saved but item status update failed:', itemUpdErr);
    }

    return NextResponse.json({ decision, item_status: newItemStatus }, { status: 201 });
}

export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
