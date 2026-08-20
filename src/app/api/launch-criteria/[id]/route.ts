import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { resolveRole } from '@/lib/roles';
import { normalizeTierOffsets, normalizeGate, normalizeTierApplicability } from '@/lib/launchCriteria';

export const dynamic = 'force-dynamic';

async function patchHandler(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const roles = [await resolveRole(user.email)];
        const rules = await getEffectivePermissionRules();
        if (!canRolesPerformWithRules(roles, 'launchCriteria.update', rules)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        // 'gate' and 'tier_applicability' are deliberately NOT in this list: the
        // admin UI sends 'hard'/'soft' for a boolean column and an array for a
        // text one, so passing them through fails the write with 22P02. They are
        // coerced below instead.
        const allowedFields = [
            'label', 'description', 'phase',
            'sort_order', 'is_active', 'default_owner_email', 'default_due_offset_days',
            'depends_on_criterion_id'
        ];
        const updates: Record<string, any> = {};

        for (const key of allowedFields) {
            if (key in body) {
                updates[key] = body[key];
            }
        }

        if ('gate' in body) updates.gate = normalizeGate(body.gate);
        if ('tier_applicability' in body) {
            updates.tier_applicability = normalizeTierApplicability(body.tier_applicability);
        }

        // Per-tier offsets are sanitized rather than passed straight into jsonb.
        if ('tier_offset_days' in body) {
            updates.tier_offset_days = normalizeTierOffsets(body.tier_offset_days);
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('criterion')
            .update(updates)
            .eq('id', id)
            .eq('context', 'launch')
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Launch criterion not found' }, { status: 404 });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error in PATCH /api/launch-criteria/[id]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function deleteHandler(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const roles = [await resolveRole(user.email)];
        const rules = await getEffectivePermissionRules();
        if (!canRolesPerformWithRules(roles, 'launchCriteria.delete', rules)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { error } = await supabase
            .from('criterion')
            .delete()
            .eq('id', id)
            .eq('context', 'launch');

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error in DELETE /api/launch-criteria/[id]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const PATCH = withRateLimit(patchHandler, RATE_LIMITS.default);
export const DELETE = withRateLimit(deleteHandler, RATE_LIMITS.default);
