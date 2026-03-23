import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { resolveRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

async function getHandler(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const url = new URL(req.url);
        const includeArchived = url.searchParams.get('include_archived') === 'true';
        const scheduleId = url.searchParams.get('schedule_id');

        let query = supabase
            .from('launch')
            .select('*, launch_epic(id, epic_id, epic:epic(id, name, tier, readiness_score, readiness_status, status))')
            .order('created_at', { ascending: false });

        if (!includeArchived) {
            query = query.eq('archived', false);
        }
        if (scheduleId) {
            query = query.eq('schedule_id', parseInt(scheduleId));
        }

        const { data, error } = await query;
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ launches: data || [] });
    } catch (error: any) {
        console.error('Error in GET /api/launches:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function postHandler(req: NextRequest) {
    try {
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
        const { name, tier, target_launch_date, owner_email, schedule_id } = body;

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        // Resolve owner_id from email if provided
        let owner_id = null;
        if (owner_email) {
            const { data: ownerUser } = await supabase
                .from('app_user')
                .select('id')
                .eq('email', owner_email.toLowerCase())
                .single();
            owner_id = ownerUser?.id || null;
        }

        const { data: launch, error } = await supabase
            .from('launch')
            .insert({
                name: name.trim(),
                tier: tier || null,
                target_launch_date: target_launch_date || null,
                owner_id,
                owner_email: owner_email?.toLowerCase() || null,
                schedule_id: schedule_id || null,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Auto-instantiate launch criteria from criterion templates where context = 'launch'
        const { data: templates } = await supabase
            .from('criterion')
            .select('id, default_owner_email, default_due_offset_days')
            .eq('context', 'launch')
            .eq('is_active', true);

        if (templates && templates.length > 0) {
            const statusRows = templates.map((t) => {
                let due_date: string | null = null;
                if (target_launch_date && t.default_due_offset_days) {
                    const d = new Date(target_launch_date);
                    d.setDate(d.getDate() - t.default_due_offset_days);
                    due_date = d.toISOString().split('T')[0];
                }
                return {
                    launch_id: launch.id,
                    criterion_id: t.id,
                    status: 'NOT_STARTED',
                    owner_email: t.default_owner_email || null,
                    due_date,
                };
            });

            await supabase.from('launch_criterion_status').insert(statusRows);
        }

        return NextResponse.json(launch, { status: 201 });
    } catch (error: any) {
        console.error('Error in POST /api/launches:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
