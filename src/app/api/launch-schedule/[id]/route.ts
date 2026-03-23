import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { resolveRole } from '@/lib/roles';

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
        if (!canRolesPerformWithRules(roles, 'launchSchedule.manage', rules)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const allowedFields = ['release_name', 'launch_date', 'archived'];
        const updates: Record<string, any> = {};

        for (const key of allowedFields) {
            if (key in body) {
                updates[key] = body[key];
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('release_schedule')
            .update(updates)
            .eq('id', parseInt(id))
            .eq('context', 'launch')
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Launch schedule entry not found' }, { status: 404 });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error in PATCH /api/launch-schedule/[id]:', error);
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
        if (!canRolesPerformWithRules(roles, 'launchSchedule.manage', rules)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { error } = await supabase
            .from('release_schedule')
            .delete()
            .eq('id', parseInt(id))
            .eq('context', 'launch');

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error in DELETE /api/launch-schedule/[id]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const PATCH = withRateLimit(patchHandler, RATE_LIMITS.default);
export const DELETE = withRateLimit(deleteHandler, RATE_LIMITS.default);
