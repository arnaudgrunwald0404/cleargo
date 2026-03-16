import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { resolveRole } from '@/lib/roles';
import { calculateLaunchReadiness } from '@/lib/launch-readiness';

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
        const allowedFields = ['name', 'tier', 'target_launch_date', 'status', 'owner_email', 'schedule_id', 'archived'];
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

        const { data, error } = await supabase
            .from('launch')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
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
