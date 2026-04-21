import { validateApiKey } from './_shared/auth';
import { createAdminSupabase } from './_shared/supabase';
import { ok, unauthorized, badRequest, internalError } from './_shared/response';

const MANAGER_EMAIL = 'agrunwald@clearcompany.com';

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: { 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
    });
  }

  if (!validateApiKey(req)) {
    return unauthorized();
  }

  if (req.method !== 'GET') {
    return badRequest('Method not allowed');
  }

  const supabase = createAdminSupabase();

  const { data: members, error: membersError } = await supabase
    .from('app_user')
    .select('id, name, email, role, slack_handle')
    .eq('reports_to_email', MANAGER_EMAIL)
    .eq('is_active', true);

  if (membersError) {
    console.error('[v1-team-members] Failed to fetch members:', membersError);
    return internalError();
  }

  if (!members || members.length === 0) {
    return ok({ data: [] });
  }

  const memberIds = members.map((m) => m.id);

  const [epicsResult, blockersResult] = await Promise.all([
    supabase
      .from('epic')
      .select('owner_id')
      .in('owner_id', memberIds)
      .not('status', 'in', '("LAUNCHED","CANCELLED","ARCHIVED")'),
    supabase
      .from('blocker')
      .select('owner_id')
      .in('owner_id', memberIds)
      .eq('status', 'open'),
  ]);

  if (epicsResult.error) {
    console.error('[v1-team-members] Failed to fetch epics:', epicsResult.error);
    return internalError();
  }

  if (blockersResult.error) {
    console.error('[v1-team-members] Failed to fetch blockers:', blockersResult.error);
    return internalError();
  }

  const epicCountByOwner: Record<string, number> = {};
  for (const epic of epicsResult.data ?? []) {
    epicCountByOwner[epic.owner_id] = (epicCountByOwner[epic.owner_id] ?? 0) + 1;
  }

  const blockerCountByOwner: Record<string, number> = {};
  for (const blocker of blockersResult.data ?? []) {
    blockerCountByOwner[blocker.owner_id] = (blockerCountByOwner[blocker.owner_id] ?? 0) + 1;
  }

  const data = members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    slack_handle: m.slack_handle,
    active_epics_count: epicCountByOwner[m.id] ?? 0,
    open_blockers_count: blockerCountByOwner[m.id] ?? 0,
  }));

  return ok({ data });
};
