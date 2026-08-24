/**
 * POST /api/paprico/items/reorder — chair drag-to-reorder: persists sort_order
 * for the given item ids in the given order. Capability: paprico.manage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { requirePapricoWriter } from '@/lib/paprico/apiHelpers';

export const dynamic = 'force-dynamic';

const reorderSchema = z.object({
    ordered_ids: z.array(z.string().uuid()).min(1).max(500),
});

async function postHandler(req: NextRequest): Promise<NextResponse> {
    const auth = await requirePapricoWriter();
    if ('response' in auth) return auth.response;

    const parsed = reorderSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }

    const sb = createAdminClient();
    const now = new Date().toISOString();
    const results = await Promise.all(
        parsed.data.ordered_ids.map((id, index) =>
            sb.from('paprico_item').update({ sort_order: index, updated_at: now }).eq('id', id)
        )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
