import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { resolveRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const ASSET_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE'] as const;

/** Supporting assets for one launch — the Marketing Brief Part 6 checklist. */
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

        const { data, error } = await supabase
            .from('launch_asset')
            .select('*')
            .eq('launch_id', id)
            .order('sort_order', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ assets: data || [] });
    } catch (error: any) {
        console.error('Error in GET /api/launches/[id]/assets:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/** Add an ad-hoc asset to a launch (template_id stays null). */
async function postHandler(
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
        if (!body.label?.trim()) {
            return NextResponse.json({ error: 'Label is required' }, { status: 400 });
        }

        // Place ad-hoc assets after the templated ones.
        const { data: last } = await supabase
            .from('launch_asset')
            .select('sort_order')
            .eq('launch_id', id)
            .order('sort_order', { ascending: false })
            .limit(1)
            .maybeSingle();

        const { data, error } = await supabase
            .from('launch_asset')
            .insert({
                launch_id: id,
                template_id: null,
                label: body.label.trim(),
                status: 'NOT_STARTED',
                owner_email: body.owner_email?.toLowerCase() || null,
                url: body.url?.trim() || null,
                notes: body.notes?.trim() || null,
                optional: body.optional === true,
                sort_order: (last?.sort_order ?? 0) + 1,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error: any) {
        console.error('Error in POST /api/launches/[id]/assets:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/** Update one asset's status, owner, link, or notes. */
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
        // Ticking an asset off is the same act as ticking a checklist item off,
        // so it rides the same capability rather than requiring full management.
        if (!canRolesPerformWithRules(roles, 'launchCriteria.status.update', rules)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        if (!body.asset_id) {
            return NextResponse.json({ error: 'asset_id is required' }, { status: 400 });
        }
        if (body.status && !ASSET_STATUSES.includes(body.status)) {
            return NextResponse.json({ error: `status must be one of ${ASSET_STATUSES.join(', ')}` }, { status: 400 });
        }

        // Deciding an asset will not ship is a scoping call rather than a status
        // tick, so it carries its own permission: PMM and SUPERADMIN only. This
        // replaces the previous rule, where the `optional` flag decided who could
        // say it -- which meant anyone who could tick, could also scope out.
        if (body.status === 'NOT_APPLICABLE' && !canRolesPerformWithRules(roles, 'launch.markNotApplicable', rules)) {
            return NextResponse.json(
                { error: 'Only PMM can mark an asset as not applicable.' },
                { status: 403 }
            );
        }

        const updates: Record<string, any> = { last_updated_at: new Date().toISOString() };
        for (const key of ['label', 'status', 'owner_email', 'url', 'notes'] as const) {
            if (key in body) updates[key] = body[key];
        }

        const { data: actor } = await supabase
            .from('app_user')
            .select('id')
            .eq('email', user.email.toLowerCase())
            .maybeSingle();
        if (actor?.id) updates.last_updated_by = actor.id;

        const { data, error } = await supabase
            .from('launch_asset')
            .update(updates)
            .eq('id', body.asset_id)
            // Scoped to the launch in the path so an asset id from another
            // launch cannot be edited through this route.
            .eq('launch_id', id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Asset not found on this launch' }, { status: 404 });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error in PATCH /api/launches/[id]/assets:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
export const PATCH = withRateLimit(patchHandler, RATE_LIMITS.default);
