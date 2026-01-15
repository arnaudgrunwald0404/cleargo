import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchJiraEpicsByName } from '@/lib/jira/client';

export async function POST(req: NextRequest) {
    try {
        // Auth check
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { epic_name } = body;

        if (!epic_name || typeof epic_name !== 'string') {
            return NextResponse.json(
                { error: 'epic_name is required and must be a string' },
                { status: 400 }
            );
        }

        const jiraEpics = await searchJiraEpicsByName(epic_name);

        return NextResponse.json({
            success: true,
            epic_name,
            matches: jiraEpics,
            count: jiraEpics.length,
        });
    } catch (error: any) {
        console.error('Jira epic search error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to search Jira epics' },
            { status: 500 }
        );
    }
}
