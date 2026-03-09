import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getJiraIssueCount } from '@/lib/jira/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/jira/issue-count?jql=<encoded_jql>
 * Returns the total count of issues matching the JQL (uses Jira approximate-count API).
 * Use this for "tickets left" display instead of search-issues length.
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: getUserError } = await supabase.auth.getUser();

        if (getUserError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const searchParams = req.nextUrl.searchParams;
        const jql = searchParams.get('jql');

        if (!jql) {
            return NextResponse.json(
                { error: 'jql query parameter is required' },
                { status: 400 }
            );
        }

        const count = await getJiraIssueCount(jql);
        return NextResponse.json({ count });
    } catch (error: any) {
        console.error('Error getting Jira issue count:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get issue count' },
            { status: 500 }
        );
    }
}
