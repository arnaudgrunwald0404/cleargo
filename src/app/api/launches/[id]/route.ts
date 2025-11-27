import { NextRequest, NextResponse } from 'next/server';
import { getLaunch, updateLaunch, deleteLaunch } from '@/lib/launches';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const launch = await getLaunch(params.id);
        return NextResponse.json(launch);
    } catch (error) {
        console.error('Error fetching launch:', error);
        return NextResponse.json({ error: 'Failed to fetch launch' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const launch = await updateLaunch(params.id, body);

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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await deleteLaunch(params.id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting launch:', error);
        return NextResponse.json({ error: 'Failed to delete launch' }, { status: 500 });
    }
}
