import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get current date and 90 days from now
        const today = new Date();
        const ninetyDaysFromNow = new Date();
        ninetyDaysFromNow.setDate(today.getDate() + 90);

        // Query launches (epics) with target launch date within 90 days
        // and count how many have feedback
        const { data: launches, error: launchError } = await supabase
            .from('launch')
            .select(`
                id,
                name,
                target_launch_date,
                feedback:feedback(count)
            `)
            .gte('target_launch_date', today.toISOString().split('T')[0])
            .lte('target_launch_date', ninetyDaysFromNow.toISOString().split('T')[0])
            .not('status', 'in', '("COMPLETED","CANCELLED")');

        if (launchError) throw launchError;

        // Count launches that have no feedback or very little feedback
        const needingFeedback = (launches || []).filter(launch => {
            const feedbackCount = launch.feedback?.[0]?.count || 0;
            return feedbackCount === 0; // No feedback at all
        });

        return NextResponse.json({
            count: needingFeedback.length,
            total: launches?.length || 0,
            launches: needingFeedback
        });

    } catch (error) {
        console.error('Error fetching releases needing feedback:', error);
        return NextResponse.json({ error: 'Failed to fetch releases needing feedback' }, { status: 500 });
    }
}

