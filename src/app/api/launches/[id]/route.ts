import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { resolveRole } from '@/lib/roles';
import { calculateLaunchReadiness } from '@/lib/launch-readiness';
import { launchCriterionApplies, tMinusDueDate } from '@/lib/launchCriteria';

export const dynamic = 'force-dynamic';

async function getHandler(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: launch, error } = await supabase
            .from('launch')
            .select(`
                *,
                launch_epic(id, epic_id, epic:epic(id, name, tier, readiness_score, readiness_status, status, target_launch_date)),
                launch_criterion_status(
                    id, criterion_id, status, owner_id, owner_email, due_date, notes, links, last_updated_at,
                    criterion:criterion(id, label, description, phase, category, gate, tier_applicability, sort_order, is_active)
                )
            `)
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Launch not found' }, { status: 404 });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(launch);
    } catch (error: any) {
        console.error('Error in GET /api/launches/[id]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

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
        if (!canRolesPerformWithRules(roles, 'launches.manage', rules)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        if ('tier' in body && body.tier !== null && body.tier !== 'TIER_1' && body.tier !== 'TIER_2') {
            return NextResponse.json({ error: 'tier must be TIER_1 or TIER_2' }, { status: 400 });
        }
        const allowedFields = ['name', 'tier', 'target_launch_date', 'status', 'owner_email', 'schedule_id', 'brief_url', 'feg_url', 'archived'];
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };

        for (const key of allowedFields) {
            if (key in body) {
                updates[key] = body[key];
            }
        }

        // Resolve owner_id if email changed
        if ('owner_email' in body) {
            if (body.owner_email) {
                const { data: ownerUser } = await supabase
                    .from('app_user')
                    .select('id')
                    .eq('email', body.owner_email.toLowerCase())
                    .single();
                updates.owner_id = ownerUser?.id || null;
                updates.owner_email = body.owner_email.toLowerCase();
            } else {
                updates.owner_id = null;
                updates.owner_email = null;
            }
        }

        // Snapshot the pre-update launch so tier/date changes can sync the checklist
        const { data: before } = await supabase
            .from('launch')
            .select('tier, target_launch_date')
            .eq('id', id)
            .single();

        const { data, error } = await supabase
            .from('launch')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Tier drives the checklist: on tier change, add newly-applicable
        // criteria and drop no-longer-applicable ones that are still untouched.
        if (before && 'tier' in updates && data.tier !== before.tier) {
            const { data: templates } = await supabase
                .from('criterion')
                .select('id, tier_applicability, default_owner_email, default_due_offset_days')
                .eq('context', 'launch')
                .eq('is_active', true);
            const { data: tasks } = await supabase
                .from('launch_criterion_status')
                .select('id, criterion_id, status')
                .eq('launch_id', id);

            const applicableIds = new Set(
                (templates || [])
                    .filter((t) => launchCriterionApplies(t.tier_applicability, data.tier))
                    .map((t) => t.id)
            );
            const haveIds = new Set((tasks || []).map((t) => t.criterion_id));

            const toAdd = (templates || [])
                .filter((t) => applicableIds.has(t.id) && !haveIds.has(t.id))
                .map((t) => ({
                    launch_id: id,
                    criterion_id: t.id,
                    status: 'NOT_STARTED',
                    owner_email: t.default_owner_email || null,
                    due_date: tMinusDueDate(data.target_launch_date, t.default_due_offset_days),
                }));
            if (toAdd.length > 0) {
                await supabase.from('launch_criterion_status').insert(toAdd);
            }

            const toRemove = (tasks || [])
                .filter((t) => !applicableIds.has(t.criterion_id) && t.status === 'NOT_STARTED')
                .map((t) => t.id);
            if (toRemove.length > 0) {
                await supabase.from('launch_criterion_status').delete().in('id', toRemove);
            }
        }

        // T-minus reflow: when the target launch date moves, recompute due dates
        // for tasks still sitting at their derived value (or empty). Manually
        // overridden dates are left alone.
        if (
            before &&
            'target_launch_date' in updates &&
            data.target_launch_date &&
            data.target_launch_date !== before.target_launch_date
        ) {
            const { data: tasks } = await supabase
                .from('launch_criterion_status')
                .select('id, due_date, criterion:criterion(default_due_offset_days)')
                .eq('launch_id', id);

            const groups = new Map<string, string[]>();
            for (const t of tasks || []) {
                const criterion = t.criterion as unknown as { default_due_offset_days: number | null } | null;
                const offset = criterion?.default_due_offset_days;
                if (offset == null) continue;
                const oldDerived = tMinusDueDate(before.target_launch_date, offset);
                if (t.due_date !== null && t.due_date !== oldDerived) continue;
                const newDerived = tMinusDueDate(data.target_launch_date, offset);
                if (!newDerived || newDerived === t.due_date) continue;
                const ids = groups.get(newDerived) || [];
                ids.push(t.id);
                groups.set(newDerived, ids);
            }
            for (const [due, ids] of groups) {
                await supabase
                    .from('launch_criterion_status')
                    .update({ due_date: due })
                    .in('id', ids);
            }
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error in PATCH /api/launches/[id]:', error);
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
        if (!canRolesPerformWithRules(roles, 'launches.manage', rules)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { error } = await supabase.from('launch').delete().eq('id', id);
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error in DELETE /api/launches/[id]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
export const PATCH = withRateLimit(patchHandler, RATE_LIMITS.default);
export const DELETE = withRateLimit(deleteHandler, RATE_LIMITS.default);
