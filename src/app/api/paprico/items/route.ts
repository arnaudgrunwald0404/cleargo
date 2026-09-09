/**
 * GET  /api/paprico/items — list items (default: open only; ?includeClosed=true for all).
 * POST /api/paprico/items — create a standing item (capability: paprico.manage).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { requirePapricoReader, requirePapricoWriter } from '@/lib/paprico/apiHelpers';

export const dynamic = 'force-dynamic';

async function getHandler(req: NextRequest): Promise<NextResponse> {
    const auth = await requirePapricoReader();
    if ('response' in auth) return auth.response;

    const includeClosed = new URL(req.url).searchParams.get('includeClosed') === 'true';
    const sb = createAdminClient();
    let query = sb.from('paprico_item').select('*').order('sort_order').order('created_at');
    if (!includeClosed) query = query.neq('status', 'closed');
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
}

const linkSchema = z.object({ label: z.string().min(1).max(200), url: z.string().url() });

const createSchema = z.object({
    title: z.string().min(1).max(500),
    description: z.string().max(20000).nullable().optional(),
    category: z.string().max(100).nullable().optional(),
    owner_email: z.string().email().nullable().optional(),
    time_box_minutes: z.number().int().min(1).max(480).nullable().optional(),
    links: z.array(linkSchema).max(20).nullable().optional(),
    // A manual item can be linked to the epic and criterion it is about, so it
    // is traceable back to the readiness matrix instead of being a loose title.
    epic_id: z.string().uuid().nullable().optional(),
    criterion_id: z.string().uuid().nullable().optional(),
});

async function postHandler(req: NextRequest): Promise<NextResponse> {
    const auth = await requirePapricoWriter();
    if ('response' in auth) return auth.response;

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }

    const sb = createAdminClient();
    const epicId = parsed.data.epic_id ?? null;
    const criterionId = parsed.data.criterion_id ?? null;

    // uq_paprico_item_open_release_pair only covers source = 'release', so the
    // database will happily accept a standing item on a pair that already has a
    // generated one -- and the agenda would then list that epic x criterion
    // twice. The check lives here rather than in the index because the index
    // guards the sync loop's idempotency, and widening it would turn the
    // materialization batch insert into an all-or-nothing failure on collision.
    // See the PR description for the full tradeoff.
    if (epicId && criterionId) {
        const { data: existing, error: dupError } = await sb
            .from('paprico_item')
            .select('id, title, source')
            .eq('epic_id', epicId)
            .eq('criterion_id', criterionId)
            .neq('status', 'closed')
            .limit(1);
        if (dupError) return NextResponse.json({ error: dupError.message }, { status: 500 });
        if (existing && existing.length > 0) {
            return NextResponse.json(
                {
                    error:
                        'That release and criterion already has an open agenda item. Edit the existing item instead of adding a second one.',
                    existing_item: existing[0],
                },
                { status: 409 }
            );
        }
    }

    const { data, error } = await sb
        .from('paprico_item')
        .insert({
            source: 'standing',
            epic_id: epicId,
            criterion_id: criterionId,
            title: parsed.data.title,
            description: parsed.data.description ?? null,
            category: parsed.data.category ?? null,
            owner_email: parsed.data.owner_email ?? null,
            time_box_minutes: parsed.data.time_box_minutes ?? null,
            links: parsed.data.links ?? null,
            status: 'proposed',
            created_by: auth.email,
        })
        .select('*')
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data }, { status: 201 });
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
