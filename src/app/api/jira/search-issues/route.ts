import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchJiraIssues } from '@/lib/jira/client';
import { getSettings } from '@/lib/settings-db';

export const dynamic = 'force-dynamic';

/**
 * Search for Jira issues using a JQL query
 * GET /api/jira/search-issues?jql=<encoded_jql>
 */
export async function GET(req: NextRequest) {
    try {
        // Auth check
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
                { error: 'JQL query parameter is required' },
                { status: 400 }
            );
        }

        // Get Jira domain for constructing web URLs
        const settings = await getSettings();
        const jiraDomain = settings.jira_domain?.trim();
        
        // Remove protocol if present
        const cleanDomain = jiraDomain?.replace(/^https?:\/\//, '').replace(/\/$/, '') || '';

        // Search for issues
        const issues = await searchJiraIssues(jql, ['summary', 'status', 'key', 'issuetype']);

        return NextResponse.json({
            issues: issues.map(issue => ({
                key: issue.key,
                summary: issue.fields.summary,
                status: issue.fields.status?.name || 'Unknown',
                statusCategory: issue.fields.status?.statusCategory?.name || 'Unknown',
                issueType: issue.fields.issuetype?.name || 'Unknown',
                url: cleanDomain ? `https://${cleanDomain}/browse/${issue.key}` : null,
            })),
            count: issues.length,
        });
    } catch (error: any) {
        console.error('Error searching Jira issues:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to search Jira issues' },
            { status: 500 }
        );
    }
}
