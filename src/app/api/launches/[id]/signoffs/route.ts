/**
 * Co-signatures on a launch gate.
 *
 * Every gate in the 00 Launch Gate Checklist ends with a signature block naming
 * two or three functions — Gate 1: PMM + CPO, Gate 2: CPO + RevOps, Gate 3: PMM +
 * Product + SE lead — each with a name and a date. ClearGO stored one decision
 * owner per criterion, so "both signed" was never representable. That is the
 * schema half of the ownership problem: no amount of filling in existing fields
 * fixed it.
 *
 * The roles required are declared on the criterion (`required_signoff_roles`);
 * this route records that one of them is satisfied.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { resolveRole } from '@/lib/roles';

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

        const { data, error } = await supabase
            .from('launch_criterion_signoff')
            .select('id, criterion_id, role, signer_user_id, signer_name, signer_email, signed_at, notes')
            .eq('launch_id', id)
            .order('signed_at', { ascending: true });

        if (error) {
            // Table absent until the 2026-08-21 bundle is applied.
            console.warn('[launches/:id/signoffs] unavailable:', error.message);
            return NextResponse.json({ signoffs: [] });
        }

        return NextResponse.json({ signoffs: data || [] });
    } catch (error: any) {
        console.error('Error in GET /api/launches/[id]/signoffs:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

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
        if (!canRolesPerformWithRules(roles, 'launchCriteria.status.update', rules)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const { criterion_id, role, signer_name, notes } = body;

        if (!criterion_id || !role) {
            return NextResponse.json(
                { error: 'criterion_id and role are required' },
                { status: 400 }
            );
        }

        // Only sign a role the gate actually asks for, so a stray role cannot
        // appear to satisfy a gate that never required it.
        const { data: criterion, error: criterionError } = await supabase
            .from('criterion')
            .select('required_signoff_roles')
            .eq('id', criterion_id)
            .single();

        if (criterionError) {
            return NextResponse.json({ error: criterionError.message }, { status: 500 });
        }
        const required: string[] = criterion?.required_signoff_roles || [];
        if (required.length > 0 && !required.includes(role)) {
            return NextResponse.json(
                { error: `This gate requires ${required.join(' + ')}; "${role}" is not one of them.` },
                { status: 400 }
            );
        }

        const { data: signer } = await supabase
            .from('app_user')
            .select('id, first_name, last_name')
            .eq('email', user.email.toLowerCase())
            .single();

        // The checklist records a typed name, and a signature should survive the
        // signer later leaving, so the name is stored alongside the FK.
        const resolvedName =
            signer_name ||
            [signer?.first_name, signer?.last_name].filter(Boolean).join(' ') ||
            user.email;

        const { data, error } = await supabase
            .from('launch_criterion_signoff')
            .upsert(
                {
                    launch_id: id,
                    criterion_id,
                    role,
                    signer_user_id: signer?.id || null,
                    signer_name: resolvedName,
                    signer_email: user.email.toLowerCase(),
                    signed_at: new Date().toISOString(),
                    notes: notes ?? null,
                },
                { onConflict: 'launch_id,criterion_id,role' }
            )
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error in POST /api/launches/[id]/signoffs:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
