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

        let { data, error } = await supabase
            .from('criterion')
            .select('*')
            .eq('context', 'launch')
            .order('phase', { ascending: true, nullsFirst: false })
            .order('sort_order', { ascending: true });

        // If context column doesn't exist yet (migration not applied), retry without it
        if (error && error.message && error.message.includes('context') && error.message.includes('does not exist')) {
            console.warn('context column missing on criterion, fetching all criteria');
            const retry = await supabase
                .from('criterion')
                .select('*')
                .order('phase', { ascending: true, nullsFirst: false })
                .order('sort_order', { ascending: true });
            data = retry.data;
            error = retry.error;
        }

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ criteria: data || [] });
    } catch (error: any) {
        console.error('Error in GET /api/launch-criteria:', error);
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
        if (!canRolesPerformWithRules(roles, 'launchCriteria.create', rules)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const {
            label, description, phase, gate, tier_applicability, sort_order,
            default_owner_email, default_due_offset_days
        } = body;

        if (!label?.trim()) {
            return NextResponse.json({ error: 'Label is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('criterion')
            .insert({
                label: label.trim(),
                description: description || null,
                context: 'launch',
                phase: phase || null,
                gate: gate || null,
                tier_applicability: tier_applicability || null,
                sort_order: sort_order ?? 0,
                default_owner_email: default_owner_email || null,
                default_due_offset_days: default_due_offset_days ?? null,
                is_active: true,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error: any) {
        console.error('Error in POST /api/launch-criteria:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
