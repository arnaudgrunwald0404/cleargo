/**
 * Gate checklist items for one launch.
 *
 * A gate used to be a single row with a single owner. Kristin's 00 Launch Gate
 * Checklist models it as a set of items each owned by a different function — the
 * Beta proof gate alone spans PM (entry conditions), SE (claims hold up live),
 * UX (adoption is real), PMM (the story lands) and RevOps (net-new sequenced).
 * Those items are what people actually tick; the gate's own status is derived
 * from them (gateStatusFromItems), which is why there is no status write here for
 * the gate itself.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { resolveRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const ITEM_STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE']);

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
            .from('launch_criterion_item')
            .select(`
                id, item_id, label, status, owner_email, notes, links, optional, sort_order, last_updated_at,
                template:criterion_item(id, criterion_id, description, owner_role, kind)
            `)
            .eq('launch_id', id)
            .order('sort_order', { ascending: true });

        if (error) {
            // The table does not exist until the 2026-08-21 bundle is applied.
            // An empty list is the honest answer, not a 500.
            console.warn('[launches/:id/items] unavailable:', error.message);
            return NextResponse.json({ items: [] });
        }

        return NextResponse.json({
            items: (data || []).map((row: any) => ({
                ...row,
                criterion_id: row.template?.criterion_id ?? null,
                owner_role: row.template?.owner_role ?? null,
                kind: row.template?.kind ?? 'check',
                description: row.template?.description ?? null,
            })),
        });
    } catch (error: any) {
        console.error('Error in GET /api/launches/[id]/items:', error);
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

        // Same capability as ticking a checklist row: an item IS a checklist row,
        // just a finer-grained one, so it reuses launchCriteria.status.update.
        const roles = [await resolveRole(user.email)];
        const rules = await getEffectivePermissionRules();
        if (!canRolesPerformWithRules(roles, 'launchCriteria.status.update', rules)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const { item_row_id, status, owner_email, notes, links } = body;

        if (!item_row_id) {
            return NextResponse.json({ error: 'item_row_id is required' }, { status: 400 });
        }
        if ('status' in body && !ITEM_STATUSES.has(status)) {
            return NextResponse.json(
                { error: `status must be one of ${[...ITEM_STATUSES].join(', ')}` },
                { status: 400 }
            );
        }

        // Saying something does not apply is a scoping call, not a status tick, so
        // it needs its own permission: PMM and SUPERADMIN only.
        if (status === 'NOT_APPLICABLE' && !canRolesPerformWithRules(roles, 'launch.markNotApplicable', rules)) {
            return NextResponse.json(
                { error: 'Only PMM can mark an item as not applicable.' },
                { status: 403 }
            );
        }

        const { data: updater } = await supabase
            .from('app_user')
            .select('id')
            .eq('email', user.email.toLowerCase())
            .single();

        const updates: Record<string, any> = {
            last_updated_at: new Date().toISOString(),
            last_updated_by: updater?.id || null,
        };
        if ('status' in body) updates.status = status;
        if ('owner_email' in body) updates.owner_email = owner_email?.toLowerCase() || null;
        if ('notes' in body) updates.notes = notes;
        if ('links' in body) updates.links = links;

        const { data, error } = await supabase
            .from('launch_criterion_item')
            .update(updates)
            // Scoped by launch as well as row id, so a row id from another launch
            // cannot be updated through this route.
            .eq('id', item_row_id)
            .eq('launch_id', id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Item not found on this launch' }, { status: 404 });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error in PATCH /api/launches/[id]/items:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
export const PATCH = withRateLimit(patchHandler, RATE_LIMITS.default);
