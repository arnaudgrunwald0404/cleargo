import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEpicById } from '@/lib/db/epics';
import { resolveAndCacheJiraEpicKey } from '@/lib/jira/resolve-and-cache-epic-key';

/**
 * GET /api/epics/[id]/jira-epic-key
 *
 * Fetches the Jira epic key for an epic (cached, then Aha integrations, then Jira search by name).
 * Returns: { jiraEpicKey: string | null, source: 'cached' | 'integrations' | 'jira_search' | null }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const epic = await getEpicById(id);
    if (!epic) {
      return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
    }
    const result = await resolveAndCacheJiraEpicKey(
      {
        id: epic.id,
        name: epic.name,
        aha_id: epic.aha_id,
        aha_fields: epic.aha_fields ?? undefined,
        jira_epic_key: epic.jira_epic_key,
      },
      supabase
    );
    return NextResponse.json({
      jiraEpicKey: result.jiraEpicKey,
      source: result.source,
      epicName: epic.name,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Jira epic key';
    console.error('Error fetching Jira epic key:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
