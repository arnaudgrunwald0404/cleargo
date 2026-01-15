import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { matchAhaEpicsWithJira } from '@/lib/jira/client';

export async function POST(req: NextRequest) {
    try {
        // Auth check
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { epic_names } = body;

        if (!epic_names || !Array.isArray(epic_names)) {
            return NextResponse.json(
                { error: 'epic_names is required and must be an array of strings' },
                { status: 400 }
            );
        }

        const matches = await matchAhaEpicsWithJira(epic_names);

        return NextResponse.json({
            success: true,
            matches,
            total_aha_epics: epic_names.length,
            matched_count: Object.keys(matches).length,
        });
    } catch (error: any) {
        console.error('Jira epic matching error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to match Jira epics' },
            { status: 500 }
        );
    }
}
