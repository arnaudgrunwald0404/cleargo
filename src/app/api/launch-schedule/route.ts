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

        let query = supabase
            .from('release_schedule')
            .select('*')
            .eq('context', 'launch')
            .order('launch_date', { ascending: true });

        if (!includeArchived) {
            query = query.eq('archived', false);
        }

        let { data, error } = await query;

        // If context or archived column doesn't exist yet (migration not applied), retry without them
        if (error && error.message && error.message.includes('does not exist')) {
            console.warn('Column missing on release_schedule, retrying:', error.message);
            let retryQuery = supabase.from('release_schedule').select('*');
            if (!error.message.includes('context')) {
                retryQuery = retryQuery.eq('context', 'launch');
            }
            if (!includeArchived && !error.message.includes('archived')) {
                retryQuery = retryQuery.eq('archived', false);
            }
            const retry = await retryQuery.order('launch_date', { ascending: true });
            data = retry.data;
            error = retry.error;
        }

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ schedules: data || [] });
    } catch (error: any) {
        console.error('Error in GET /api/launch-schedule:', error);
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
        if (!canRolesPerformWithRules(roles, 'launchSchedule.manage', rules)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const { release_name, launch_date } = body;

        if (!release_name?.trim()) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        const insertData: Record<string, any> = {
            release_name: release_name.trim(),
            context: 'launch',
        };

        if (launch_date) {
            insertData.launch_date = launch_date;
        }

        const { data, error } = await supabase
            .from('release_schedule')
            .insert(insertData)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ error: 'A launch schedule with this name already exists' }, { status: 409 });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error: any) {
        console.error('Error in POST /api/launch-schedule:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
