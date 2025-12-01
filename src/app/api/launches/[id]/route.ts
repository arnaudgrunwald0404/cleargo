import { NextRequest, NextResponse } from 'next/server';
import { getLaunch, updateLaunch, deleteLaunch } from '@/lib/launches';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const resolvedParams = await Promise.resolve(params);
        const launch = await getLaunch(resolvedParams.id);
        if (!launch) {
            return NextResponse.json({ error: 'Launch not found' }, { status: 404 });
        }
        return NextResponse.json(launch);
    } catch (error: any) {
        console.error('Error fetching launch:', error);
        // Check if it's a "not found" error from Supabase
        if (error?.code === 'PGRST116' || error?.message?.includes('No rows')) {
            return NextResponse.json({ error: 'Launch not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to fetch launch' }, { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const resolvedParams = await Promise.resolve(params);
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();

        // Load current launch to compare changes
        const current = await getLaunch(resolvedParams.id);
        if (!current) {
            return NextResponse.json({ error: 'Launch not found' }, { status: 404 });
        }

        // Load caller roles
        const { data: me } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();
        const roles = (me?.roles as string[]) || [];

        // Enforce capability-based rules
        const { canRolesPerform } = await import('@/lib/permissions');
        if (typeof body.tier !== 'undefined' && body.tier !== current.tier) {
            const ok = await canRolesPerform(roles, 'launch.tier.update');
            if (!ok) return NextResponse.json({ error: 'Forbidden: cannot update launch tier' }, { status: 403 });
        }
        if (typeof body.risk_level !== 'undefined' && body.risk_level !== current.risk_level) {
            const ok = await canRolesPerform(roles, 'launch.risk.update');
            if (!ok) return NextResponse.json({ error: 'Forbidden: cannot update launch risk level' }, { status: 403 });
        }

        const launch = await updateLaunch(resolvedParams.id, body);

        // Trigger write-back to Aha! if launch has aha_id
        if (launch.aha_id) {
            try {
                const { writeBackLaunchReadiness } = await import('@/lib/aha/write-back');
                await writeBackLaunchReadiness(launch.id);
                console.log(`Write-back triggered for launch ${launch.id}`);
            } catch (error) {
                console.error('Write-back failed:', error);
                // Don't fail the update if write-back fails
            }
        }

        return NextResponse.json(launch);
    } catch (error) {
        console.error('Error updating launch:', error);
        return NextResponse.json({ error: 'Failed to update launch' }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const resolvedParams = await Promise.resolve(params);
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check capability to delete launch
        const { data: me } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();
        const roles = (me?.roles as string[]) || [];
        const { canRolesPerform } = await import('@/lib/permissions');
        const ok = await canRolesPerform(roles, 'launch.delete');
        if (!ok) return NextResponse.json({ error: 'Forbidden: cannot delete launch' }, { status: 403 });

        await deleteLaunch(resolvedParams.id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting launch:', error);
        return NextResponse.json({ error: 'Failed to delete launch' }, { status: 500 });
    }
}
