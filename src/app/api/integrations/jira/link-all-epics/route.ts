import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/roles';
import { resolveAndCacheJiraEpicKey } from '@/lib/jira/resolve-and-cache-epic-key';
import { getJiraIssueCount } from '@/lib/jira/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function requireAdmin(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const role = await resolveRole(user.email);
  if (role !== 'SUPERADMIN' && role !== 'PRODUCT_OPS' && role !== 'CPO') {
    return { error: NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 }) };
  }
  return { user };
}

const OPEN_TICKETS_JQL = (epicKey: string) =>
  `parent = ${epicKey} and statusCategory != Done`;

const BATCH_SIZE = 10;

/**
 * GET /api/integrations/jira/link-all-epics
 * Returns counts: epics linked to Jira vs not linked, and epics with open Jira tickets. Requires admin role.
 */
export async function GET() {
  try {
    const supabase = createClient();
    const auth = await requireAdmin(supabase);
    if (auth.error) return auth.error;

    const { count: total } = await supabase
      .from('epic')
      .select('*', { count: 'exact', head: true });

    const { count: linked } = await supabase
      .from('epic')
      .select('*', { count: 'exact', head: true })
      .not('jira_epic_key', 'is', null)
      .neq('jira_epic_key', '');

    const totalCount = total ?? 0;
    const linkedCount = linked ?? 0;

    let epicsWithOpenTickets = 0;
    try {
      const { data: linkedEpics } = await supabase
        .from('epic')
        .select('jira_epic_key')
        .not('jira_epic_key', 'is', null)
        .neq('jira_epic_key', '');

      const keys = (linkedEpics ?? [])
        .map((e) => e.jira_epic_key?.trim())
        .filter((k): k is string => !!k);

      for (let i = 0; i < keys.length; i += BATCH_SIZE) {
        const batch = keys.slice(i, i + BATCH_SIZE);
        const counts = await Promise.all(
          batch.map((key) => getJiraIssueCount(OPEN_TICKETS_JQL(key)))
        );
        epicsWithOpenTickets += counts.filter((c) => c > 0).length;
      }
    } catch (err) {
      console.error('Error fetching open ticket counts for link stats:', err);
    }

    return NextResponse.json({
      linked: linkedCount,
      notLinked: Math.max(0, totalCount - linkedCount),
      epicsWithOpenTickets,
    });
  } catch (error: unknown) {
    console.error('Jira link stats error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/integrations/jira/link-all-epics
 * Finds all ClearGO epics where jira_epic_key is not set and runs resolution (Aha integrations + Jira search).
 * Requires admin role.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const auth = await requireAdmin(supabase);
    if (auth.error) return auth.error;

    const { data: epics, error: fetchError } = await supabase
      .from('epic')
      .select('id, name, aha_id, aha_fields, jira_epic_key')
      .is('jira_epic_key', null);

    if (fetchError) {
      console.error('Error fetching epics for Jira link:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch epics' }, { status: 500 });
    }

    if (!epics?.length) {
      return NextResponse.json({
        message: 'No epics without a Jira link found.',
        total: 0,
        linked: 0,
        processed: 0,
      });
    }

    let linked = 0;
    const errors: Array<{ epicId: string; epicName: string | null; error: string }> = [];

    for (const epic of epics) {
      try {
        const result = await resolveAndCacheJiraEpicKey(
          {
            id: epic.id,
            name: epic.name ?? null,
            aha_id: epic.aha_id ?? null,
            aha_fields: epic.aha_fields ?? undefined,
            jira_epic_key: epic.jira_epic_key ?? null,
          },
          supabase
        );
        if (result.jiraEpicKey) {
          linked++;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ epicId: epic.id, epicName: epic.name ?? null, error: message });
      }
    }

    return NextResponse.json({
      message: `Processed ${epics.length} epic(s); linked ${linked} to Jira.`,
      total: epics.length,
      linked,
      processed: epics.length,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to link epics';
    console.error('Jira link-all-epics error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
