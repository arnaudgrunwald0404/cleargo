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

        await deleteLaunch(resolvedParams.id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting launch:', error);
        return NextResponse.json({ error: 'Failed to delete launch' }, { status: 500 });
    }
}
