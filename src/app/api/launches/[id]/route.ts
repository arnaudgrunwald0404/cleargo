import { NextRequest, NextResponse } from 'next/server';
import { getEpic, updateEpic, deleteEpic } from '@/lib/epics';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const epic = await getEpic(id);
        if (!epic) {
            return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
        }
        return NextResponse.json(epic);
    } catch (error: any) {
        console.error('Error fetching epic:', error);
        // Check if it's a "not found" error from Supabase
        if (error?.code === 'PGRST116' || error?.message?.includes('No rows')) {
            return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to fetch epic' }, { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();

        // Load current epic to compare changes
        const current = await getEpic(id);
        if (!current) {
            return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
        }

        // Load caller roles
        const { data: me } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();
        const roles = (me?.roles as string[]) || [];

        const rules = await getEffectivePermissionRules();
        if (typeof body.tier !== 'undefined' && body.tier !== current.tier) {
            const ok = canRolesPerformWithRules(roles, 'launch.tier.update', rules);
            if (!ok) return NextResponse.json({ error: 'Forbidden: cannot update epic tier' }, { status: 403 });
        }
        if (typeof body.risk_level !== 'undefined' && body.risk_level !== current.risk_level) {
            const ok = canRolesPerformWithRules(roles, 'launch.risk.update', rules);
            if (!ok) return NextResponse.json({ error: 'Forbidden: cannot update epic risk level' }, { status: 403 });
        }

        const epic = await updateEpic(id, body);

        // Trigger write-back to Aha! if epic has aha_id
        if (epic.aha_id) {
            try {
                const { writeBackEpicReadiness } = await import('@/lib/aha/write-back');
                await writeBackEpicReadiness(epic.id);
                console.log(`Write-back triggered for epic ${epic.id}`);
            } catch (error) {
                console.error('Write-back failed:', error);
                // Don't fail the update if write-back fails
            }
        }

        return NextResponse.json(epic);
    } catch (error) {
        console.error('Error updating epic:', error);
        return NextResponse.json({ error: 'Failed to update epic' }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check capability to delete epic
        const { data: me } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();
        const roles = (me?.roles as string[]) || [];
        const rules = await getEffectivePermissionRules();
        const ok = canRolesPerformWithRules(roles, 'launch.delete', rules);
        if (!ok) return NextResponse.json({ error: 'Forbidden: cannot delete epic' }, { status: 403 });

        await deleteEpic(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting epic:', error);
        return NextResponse.json({ error: 'Failed to delete epic' }, { status: 500 });
    }
}
