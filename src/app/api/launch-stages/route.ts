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

        const { data, error } = await supabase
            .from('launch_stages')
            .select('*')
            .order('sort_order', { ascending: true });

        if (error) {
            console.error('Error fetching launch stages:', error);
            console.error('Error code:', error.code);
            console.error('Error details:', JSON.stringify(error, null, 2));

            // Provide more helpful error messages
            let errorMessage = error.message || 'Failed to fetch launch stages';
            if (error.code === '42P01') {
                errorMessage = 'The launch_stages table does not exist. Please run the migration: supabase/migrations/20251202000000_create_launch_stages.sql';
            } else if (error.code === '42501') {
                errorMessage = 'Permission denied. Check RLS policies for launch_stages table.';
            }

            return NextResponse.json(
                {
                    error: errorMessage,
                    code: error.code,
                    details: process.env.NODE_ENV === 'development' ? error.message : undefined
                },
                { status: 500 }
            );
        }

        return NextResponse.json({ stages: data || [] });
    } catch (error: any) {
        console.error('Error in GET /api/launch-stages:', error);
        return NextResponse.json(
            { error: 'Failed to fetch launch stages', details: error.message },
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

        // Capability: launchStages.manage
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
        const ok = canRolesPerformWithRules((me?.roles as string[]) || [], 'launchStages.manage', rules);
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
            .from('launch_stages')
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
            console.error('Error creating launch stage:', error);
            return NextResponse.json(
                { error: 'Failed to create launch stage', details: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ stage: data });
    } catch (error: any) {
        console.error('Error in POST /api/launch-stages:', error);
        return NextResponse.json(
            { error: 'Failed to create launch stage', details: error.message },
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

        // Capability: launchStages.manage
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
        const ok = canRolesPerformWithRules((me?.roles as string[]) || [], 'launchStages.manage', rules);
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
            .from('launch_stages')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating launch stage:', error);
            console.error('Update payload:', JSON.stringify(updates, null, 2));
            console.error('Stage ID:', id);
            console.error('Request body:', JSON.stringify(body, null, 2));
            return NextResponse.json(
                {
                    error: 'Failed to update launch stage',
                    details: error.message,
                    code: error.code,
                    hint: error.hint
                },
                { status: 500 }
            );
        }

        return NextResponse.json({ stage: data });
    } catch (error: any) {
        console.error('Error in PATCH /api/launch-stages:', error);
        console.error('Request body:', JSON.stringify(body, null, 2));
        return NextResponse.json(
            { error: 'Failed to update launch stage', details: error.message },
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

        // Capability: launchStages.manage
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();

        if (userError) {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }

        const rules = await getEffectivePermissionRules();
        const ok = canRolesPerformWithRules((me?.roles as string[]) || [], 'launchStages.manage', rules);
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
            .from('launch_stages')
            .upsert(updates)
            .select();

        if (error) {
            console.error('Error batch updating launch stages:', error);
            return NextResponse.json(
                { error: 'Failed to update stages', details: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ stages: data });
    } catch (error: any) {
        console.error('Error in PUT /api/launch-stages:', error);
        return NextResponse.json(
            { error: 'Failed to update stages', details: error.message },
            { status: 500 }
        );
    }
}

export const PUT = withRateLimit(putHandler, RATE_LIMITS.default);
