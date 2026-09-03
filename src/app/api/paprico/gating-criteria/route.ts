/**
 * GET /api/paprico/gating-criteria — gating config joined with criterion labels,
 *      the default lookahead, and the release criteria available to add.
 * PUT /api/paprico/gating-criteria — replace the gating set and/or update the
 *      default lookahead. Capability: paprico.manage.
 *
 * Gating criteria are matched by criterion_id, never by label (spec §3):
 * criteria get renumbered and relabelled and the report must not break.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { requirePapricoReader, requirePapricoWriter } from '@/lib/paprico/apiHelpers';
import { DEFAULT_LOOKAHEAD_DAYS } from '@/lib/paprico/agenda';

export const dynamic = 'force-dynamic';

async function getHandler(): Promise<NextResponse> {
    const auth = await requirePapricoReader();
    if ('response' in auth) return auth.response;

    const sb = createAdminClient();
    const [gatingRes, criteriaRes, settingsRes] = await Promise.all([
        sb
            .from('paprico_gating_criterion')
            .select('criterion_id, enabled, lookahead_days, criterion:criterion(id, label, category, is_active)'),
        sb
            .from('criterion')
            .select('id, label, category, is_active')
            .eq('context', 'release')
            .eq('is_active', true)
            .order('label'),
        sb.from('app_settings').select('paprico_default_lookahead_days').order('id', { ascending: true }).limit(1),
    ]);
    if (gatingRes.error) return NextResponse.json({ error: gatingRes.error.message }, { status: 500 });
    if (criteriaRes.error) return NextResponse.json({ error: criteriaRes.error.message }, { status: 500 });

    const defaultLookahead =
        (settingsRes.data?.[0] as { paprico_default_lookahead_days?: number } | undefined)
            ?.paprico_default_lookahead_days ?? DEFAULT_LOOKAHEAD_DAYS;

    return NextResponse.json({
        gating_criteria: gatingRes.data ?? [],
        available_criteria: criteriaRes.data ?? [],
        default_lookahead_days: defaultLookahead,
    });
}

const putSchema = z.object({
    entries: z
        .array(
            z.object({
                criterion_id: z.string().uuid(),
                enabled: z.boolean(),
                lookahead_days: z.number().int().min(1).max(365).nullable(),
            })
        )
        .max(200)
        .optional(),
    default_lookahead_days: z.number().int().min(1).max(365).optional(),
});

async function putHandler(req: NextRequest): Promise<NextResponse> {
    const auth = await requirePapricoWriter();
    if ('response' in auth) return auth.response;

    const parsed = putSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }

    const sb = createAdminClient();
    const now = new Date().toISOString();

    if (parsed.data.entries) {
        const entries = parsed.data.entries;
        const keepIds = entries.map((e) => e.criterion_id);

        if (entries.length > 0) {
            const { error: upsertErr } = await sb.from('paprico_gating_criterion').upsert(
                entries.map((e) => ({
                    criterion_id: e.criterion_id,
                    enabled: e.enabled,
                    lookahead_days: e.lookahead_days,
                    updated_at: now,
                })),
                { onConflict: 'criterion_id' }
            );
            if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
        }

        // PUT semantics: entries not in the payload are removed from the gating set.
        const deleteQuery = sb.from('paprico_gating_criterion').delete();
        const { error: deleteErr } = await (keepIds.length > 0
            ? deleteQuery.not('criterion_id', 'in', `(${keepIds.join(',')})`)
            : deleteQuery.neq('criterion_id', '00000000-0000-0000-0000-000000000000'));
        if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    if (parsed.data.default_lookahead_days != null) {
        const { data: settingsRow, error: readErr } = await sb
            .from('app_settings')
            .select('id')
            .order('id', { ascending: true })
            .limit(1)
            .maybeSingle();
        if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
        if (settingsRow) {
            const { error: updErr } = await sb
                .from('app_settings')
                .update({ paprico_default_lookahead_days: parsed.data.default_lookahead_days })
                .eq('id', settingsRow.id);
            if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
        }
    }

    return NextResponse.json({ ok: true });
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
export const PUT = withRateLimit(putHandler, RATE_LIMITS.default);
