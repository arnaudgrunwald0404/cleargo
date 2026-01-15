import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEpicById } from '@/lib/db/epics';
import { extractJiraEpicKeyFromIntegrations } from '@/lib/jira/epic-key-extractor';
import { searchJiraEpicsByName } from '@/lib/jira/client';
import { getSettings } from '@/lib/settings-db';

/**
 * GET /api/epics/[id]/jira-epic-key
 * 
 * Fetches the Jira epic key for an epic by:
 * 1. PRIMARY: Searching Jira API by epic name (exact match)
 * 2. FALLBACK: Extracting from AHA integrations field
 * 
 * Returns: { jiraEpicKey: string | null, source: 'jira_search' | 'integrations' | null }
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        
        // Auth check
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get epic from database
        const epic = await getEpicById(id);
        if (!epic) {
            return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
        }

        // Check Jira integration is configured
        const settings = await getSettings();
        if (!settings.jira_domain || !settings.jira_email || !settings.jira_api_token) {
            return NextResponse.json({
                jiraEpicKey: null,
                source: null,
                error: 'Jira integration not configured'
            });
        }

        // PRIMARY METHOD: Search Jira API by epic name
        if (epic.name) {
            try {
                console.log(`🔍 [PRIMARY] Searching Jira for epic by name: "${epic.name}"`);
                console.log(`   Epic name length: ${epic.name.length}`);
                console.log(`   Epic name bytes: ${Buffer.from(epic.name).toString('hex')}`);
                
                const jiraEpics = await searchJiraEpicsByName(epic.name);
                
                if (jiraEpics.length > 0) {
                    // Use the first match (exact match should return one result)
                    const jiraEpicKey = jiraEpics[0].key;
                    const matchedSummary = jiraEpics[0].fields.summary;
                    console.log(`✅ Found Jira epic key via Jira API search: ${jiraEpicKey}`);
                    console.log(`   Matched summary: "${matchedSummary}"`);
                    console.log(`   Original name: "${epic.name}"`);
                    console.log(`   Match count: ${jiraEpics.length}`);
                    
                    return NextResponse.json({
                        jiraEpicKey,
                        source: 'jira_search',
                        epicName: epic.name,
                        matchedSummary: matchedSummary,
                        matches: jiraEpics.length
                    });
                } else {
                    console.log(`❌ No Jira epic found matching name: "${epic.name}"`);
                    console.log(`   This might indicate:`);
                    console.log(`   - Epic name doesn't match exactly in Jira`);
                    console.log(`   - Epic doesn't exist in Jira yet`);
                    console.log(`   - Jira API permissions issue`);
                }
            } catch (error: any) {
                console.error('Error searching Jira for epic:', error);
                console.error('   Error details:', {
                    message: error.message,
                    stack: error.stack
                });
                // Continue to fallback method
            }
        }

        // FALLBACK METHOD: Extract from AHA integrations field
        const ahaFieldsStruct = epic.aha_fields as any;
        const standardFields = ahaFieldsStruct?.standard_fields || {};
        const integrations = standardFields.integrations;

        if (integrations) {
            console.log(`🔍 [FALLBACK] Trying to extract from AHA integrations field`);
            const jiraEpicKey = extractJiraEpicKeyFromIntegrations(integrations);
            if (jiraEpicKey) {
                console.log(`✅ Found Jira epic key via integrations field: ${jiraEpicKey}`);
                return NextResponse.json({
                    jiraEpicKey,
                    source: 'integrations',
                    epicName: epic.name
                });
            }
        }

        return NextResponse.json({
            jiraEpicKey: null,
            source: null,
            epicName: epic.name
        });

    } catch (error: any) {
        console.error('Error fetching Jira epic key:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch Jira epic key' },
            { status: 500 }
        );
    }
}
