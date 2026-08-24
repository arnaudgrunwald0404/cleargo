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
        .from('paprico_item')
        .insert({
            source: 'standing',
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
