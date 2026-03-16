import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

async function getHandler(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let { data, error } = await supabase
            .from('release_stages')
            .select('*')
            .order('sort_order', { ascending: true });

        // If release_stages doesn't exist, try legacy launch_stages table (pre-rename migration)
        if (error && (error.code === '42P01' || error.code === 'PGRST205')) {
            console.warn('release_stages table not found, trying launch_stages');
            const fallback = await supabase
                .from('launch_stages')
                .select('*')
                .order('sort_order', { ascending: true });
            data = fallback.data;
            error = fallback.error;
        }

        if (error) {
            console.error('Error fetching release stages:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ stages: data || [] });
    } catch (error: any) {
        console.error('Error in GET /api/release-stages:', error);
        return NextResponse.json(
            { error: 'Failed to fetch release stages', details: error.message },
            { status: 500 }
        );
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);

async function postHandler(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Capability: releaseStages.manage
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();

        // Handle case where user doesn't exist in app_user table
        if (userError && userError.code === 'PGRST116') {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError) {
            throw userError;
        }

        const rules = await getEffectivePermissionRules();
        const ok = canRolesPerformWithRules((me?.roles as string[]) || [], 'releaseStages.manage', rules);
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const body = await req.json();
        const { name, sort_order, duration_days, details } = body;

        if (!name || sort_order === undefined) {
            return NextResponse.json(
                { error: 'Name and sort_order are required' },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from('release_stages')
            .insert({
                name,
                sort_order,
                duration_days: duration_days || null,
                details: details || null,
                updated_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating release stage:', error);
            return NextResponse.json(
                { error: 'Failed to create release stage', details: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ stage: data });
    } catch (error: any) {
        console.error('Error in POST /api/release-stages:', error);
        return NextResponse.json(
            { error: 'Failed to create release stage', details: error.message },
            { status: 500 }
        );
    }
}

async function patchHandler(req: NextRequest) {
    let body: any = null;
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Capability: releaseStages.manage
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();

        // Handle case where user doesn't exist in app_user table
        if (userError && userError.code === 'PGRST116') {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError) {
            throw userError;
        }

        const rules = await getEffectivePermissionRules();
        const ok = canRolesPerformWithRules((me?.roles as string[]) || [], 'releaseStages.manage', rules);
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        body = await req.json();
        const { id, name, sort_order, duration_days, details } = body;

        if (!id) {
            return NextResponse.json(
                { error: 'ID is required' },
                { status: 400 }
            );
        }

        const updates: any = {
            updated_at: new Date().toISOString(),
        };

        if (name !== undefined) updates.name = name;
        if (sort_order !== undefined) updates.sort_order = sort_order;
        if (duration_days !== undefined) updates.duration_days = duration_days || null;
        if (details !== undefined) updates.details = details || null;

        const { data, error } = await supabase
            .from('release_stages')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating release stage:', error);
            console.error('Update payload:', JSON.stringify(updates, null, 2));
            console.error('Stage ID:', id);
            console.error('Request body:', JSON.stringify(body, null, 2));
            return NextResponse.json(
                {
                    error: 'Failed to update release stage',
                    details: error.message,
                    code: error.code,
                    hint: error.hint
                },
                { status: 500 }
            );
        }

        return NextResponse.json({ stage: data });
    } catch (error: any) {
        console.error('Error in PATCH /api/release-stages:', error);
        console.error('Request body:', JSON.stringify(body, null, 2));
        return NextResponse.json(
            { error: 'Failed to update release stage', details: error.message },
            { status: 500 }
        );
    }
}

export const PATCH = withRateLimit(patchHandler, RATE_LIMITS.default);

export const POST = withRateLimit(postHandler, RATE_LIMITS.default);

async function putHandler(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Capability: releaseStages.manage
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();

        if (userError) {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }

        const rules = await getEffectivePermissionRules();
        const ok = canRolesPerformWithRules((me?.roles as string[]) || [], 'releaseStages.manage', rules);
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const body = await req.json();
        const { stages } = body;

        if (!Array.isArray(stages)) {
            return NextResponse.json(
                { error: 'Stages array is required' },
                { status: 400 }
            );
        }

        // Perform updates in a transaction-like manner (using upsert for batch)
        const updates = stages.map((stage: any) => ({
            id: stage.id,
            name: stage.name,
            sort_order: stage.sort_order,
            duration_days: stage.duration_days,
            details: stage.details,
            updated_at: new Date().toISOString(),
        }));

        const { data, error } = await supabase
            .from('release_stages')
            .upsert(updates)
            .select();

        if (error) {
            console.error('Error batch updating release stages:', error);
            return NextResponse.json(
                { error: 'Failed to update stages', details: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ stages: data });
    } catch (error: any) {
        console.error('Error in PUT /api/release-stages:', error);
        return NextResponse.json(
            { error: 'Failed to update stages', details: error.message },
            { status: 500 }
        );
    }
}

export const PUT = withRateLimit(putHandler, RATE_LIMITS.default);
