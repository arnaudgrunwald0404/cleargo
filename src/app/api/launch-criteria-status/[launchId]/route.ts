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
    { params }: { params: Promise<{ launchId: string }> }
) {
    try {
        const { launchId } = await params;
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, error } = await supabase
            .from('launch_criterion_status')
            .select(`
                *,
                criterion:criterion(id, label, description, phase, category, gate, tier_applicability, sort_order, is_active, default_owner_email, default_due_offset_days)
            `)
            .eq('launch_id', launchId)
            .order('created_at', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ statuses: data || [] });
    } catch (error: any) {
        console.error('Error in GET /api/launch-criteria-status/[launchId]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function patchHandler(
    req: NextRequest,
    { params }: { params: Promise<{ launchId: string }> }
) {
    try {
        const { launchId } = await params;
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const roles = [await resolveRole(user.email)];
        const rules = await getEffectivePermissionRules();
        if (!canRolesPerformWithRules(roles, 'launchCriteria.status.update', rules)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const { criterion_id, status, owner_email, due_date, notes, links } = body;

        if (!criterion_id) {
            return NextResponse.json({ error: 'criterion_id is required' }, { status: 400 });
        }

        // Resolve owner_id if email provided
        let owner_id: string | null = undefined as any;
        if ('owner_email' in body) {
            if (owner_email) {
                const { data: ownerUser } = await supabase
                    .from('app_user')
                    .select('id')
                    .eq('email', owner_email.toLowerCase())
                    .single();
                owner_id = ownerUser?.id || null;
            } else {
                owner_id = null;
            }
        }

        // Resolve updater
        const { data: updaterUser } = await supabase
            .from('app_user')
            .select('id')
            .eq('email', user.email.toLowerCase())
            .single();

        const updates: Record<string, any> = {
            last_updated_at: new Date().toISOString(),
            last_updated_by: updaterUser?.id || null,
        };

        if ('status' in body) updates.status = status;
        if ('owner_email' in body) {
            updates.owner_email = owner_email?.toLowerCase() || null;
            updates.owner_id = owner_id;
        }
        if ('due_date' in body) updates.due_date = due_date;
        if ('notes' in body) updates.notes = notes;
        if ('links' in body) updates.links = links;

        const { data, error } = await supabase
            .from('launch_criterion_status')
            .update(updates)
            .eq('launch_id', launchId)
            .eq('criterion_id', criterion_id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Status record not found' }, { status: 404 });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Recalculate launch readiness_pct
        const { data: allStatuses } = await supabase
            .from('launch_criterion_status')
            .select('status')
            .eq('launch_id', launchId);

        if (allStatuses) {
            const readinessPct = calculateLaunchReadiness(allStatuses as any);
            await supabase
                .from('launch')
                .update({ readiness_pct: readinessPct, updated_at: new Date().toISOString() })
                .eq('id', launchId);
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error in PATCH /api/launch-criteria-status/[launchId]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
export const PATCH = withRateLimit(patchHandler, RATE_LIMITS.default);
