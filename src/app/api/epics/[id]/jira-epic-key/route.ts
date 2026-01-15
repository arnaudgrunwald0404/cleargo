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

        // Check if we have a cached Jira epic key
        console.log(`🔍 Checking for cached Jira epic key for epic ${id}`);
        console.log(`   Epic jira_epic_key value:`, epic.jira_epic_key);
        console.log(`   Epic jira_epic_key type:`, typeof epic.jira_epic_key);
        console.log(`   Epic jira_epic_key truthy check:`, !!epic.jira_epic_key);
        
        if (epic.jira_epic_key) {
            console.log(`✅ Using cached Jira epic key: ${epic.jira_epic_key}`);
            return NextResponse.json({
                jiraEpicKey: epic.jira_epic_key,
                source: 'cached',
                epicName: epic.name
            });
        } else {
            console.log(`❌ No cached Jira epic key found, will search...`);
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

        let foundJiraEpicKey: string | null = null;
        let source: 'jira_search' | 'integrations' | null = null;
        let matchedSummary: string | undefined;

        // PRIMARY METHOD: Search Jira API by epic name
        if (epic.name) {
            try {
                console.log(`🔍 [PRIMARY] Searching Jira for epic by name: "${epic.name}"`);
                console.log(`   Epic name length: ${epic.name.length}`);
                console.log(`   Epic name bytes: ${Buffer.from(epic.name).toString('hex')}`);
                
                const jiraEpics = await searchJiraEpicsByName(epic.name);
                
                if (jiraEpics.length > 0) {
                    // Use the first match (exact match should return one result)
                    foundJiraEpicKey = jiraEpics[0].key;
                    matchedSummary = jiraEpics[0].fields.summary;
                    source = 'jira_search';
                    console.log(`✅ Found Jira epic key via Jira API search: ${foundJiraEpicKey}`);
                    console.log(`   Matched summary: "${matchedSummary}"`);
                    console.log(`   Original name: "${epic.name}"`);
                    console.log(`   Match count: ${jiraEpics.length}`);
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
        if (!foundJiraEpicKey) {
            const ahaFieldsStruct = epic.aha_fields as any;
            const standardFields = ahaFieldsStruct?.standard_fields || {};
            const integrations = standardFields.integrations;

            if (integrations) {
                console.log(`🔍 [FALLBACK] Trying to extract from AHA integrations field`);
                const jiraEpicKey = extractJiraEpicKeyFromIntegrations(integrations);
                if (jiraEpicKey) {
                    foundJiraEpicKey = jiraEpicKey;
                    source = 'integrations';
                    console.log(`✅ Found Jira epic key via integrations field: ${foundJiraEpicKey}`);
                }
            }
        }

        // Save the found Jira epic key to the database for future use
        if (foundJiraEpicKey) {
            try {
                console.log(`💾 Attempting to cache Jira epic key ${foundJiraEpicKey} for epic ${id}`);
                const { data: updateData, error: updateError } = await supabase
                    .from('epic')
                    .update({ jira_epic_key: foundJiraEpicKey, updated_at: new Date().toISOString() })
                    .eq('id', id)
                    .select('jira_epic_key')
                    .single();

                if (updateError) {
                    // Check if error is due to missing column (migration not run)
                    if (updateError.message?.includes('jira_epic_key') || updateError.code === '42703') {
                        console.warn(`⚠️ Cannot cache Jira epic key: jira_epic_key column may not exist yet. Please run migration 20260118000000_add_jira_epic_key_to_epic.sql`);
                        console.warn(`   Error details:`, updateError);
                    } else {
                        console.error(`❌ Failed to cache Jira epic key:`, updateError);
                        console.error(`   Error code:`, updateError.code);
                        console.error(`   Error message:`, updateError.message);
                    }
                    // Continue anyway - we still return the key
                } else {
                    console.log(`✅ Successfully cached Jira epic key ${foundJiraEpicKey} for epic ${id}`);
                    if (updateData) {
                        console.log(`   Verified cached value:`, updateData.jira_epic_key);
                    }
                }
            } catch (cacheError: any) {
                console.error(`❌ Exception while caching Jira epic key:`, cacheError);
                console.error(`   Error type:`, cacheError.constructor.name);
                console.error(`   Error message:`, cacheError.message);
                console.error(`   Error stack:`, cacheError.stack);
                // Continue anyway - we still return the key
            }
        }

        return NextResponse.json({
            jiraEpicKey: foundJiraEpicKey,
            source: source,
            epicName: epic.name,
            ...(matchedSummary && { matchedSummary }),
        });

    } catch (error: any) {
        console.error('Error fetching Jira epic key:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch Jira epic key' },
            { status: 500 }
        );
    }
}
