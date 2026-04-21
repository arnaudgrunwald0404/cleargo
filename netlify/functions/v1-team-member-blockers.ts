import { validateApiKey } from './_shared/auth';
import { createAdminSupabase } from './_shared/supabase';
import { ok, unauthorized, badRequest, notFound, internalError } from './_shared/response';

/** Map ClearGO criterion status + gate flag → blocker severity */
function deriveSeverity(status: string, isGate: boolean): 'low' | 'medium' | 'high' | 'critical' {
  if (status === 'NO_GO') return isGate ? 'critical' : 'high';
  return 'medium'; // CONDITIONAL
}

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

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return badRequest('id is required');

  const supabase = createAdminSupabase();

  const { data: member, error: memberError } = await supabase
    .from('app_user')
    .select('id, name, email')
    .eq('id', id)
    .single();

  if (memberError) {
    if (memberError.code === 'PGRST116') return notFound('Team member not found');
    console.error('[v1-team-member-blockers] member fetch error:', memberError);
    return internalError();
  }

  // Get all active epics owned by this member
  const { data: epics, error: epicsError } = await supabase
    .from('epic')
    .select('id, name')
    .eq('owner_id', id)
    .not('status', 'in', '("LAUNCHED","CANCELLED","ARCHIVED","COMPLETED")');

  if (epicsError) {
    console.error('[v1-team-member-blockers] epics fetch error:', epicsError);
    return internalError();
  }

  if (!epics || epics.length === 0) {
    return ok({ member: { id: member.id, name: member.name, email: member.email }, data: [] });
  }

  const epicIds = epics.map((e) => e.id);
  const epicNameById: Record<string, string> = Object.fromEntries(epics.map((e) => [e.id, e.name]));

  // Derive blockers from NO_GO / CONDITIONAL criteria
  const { data: criteriaStatuses, error: csError } = await supabase
    .from('epic_criterion_status')
    .select('id, epic_id, criterion_id, status, current_status_notes, condition_due_date, last_updated_at, criterion:criterion_id(label, gate)')
    .in('epic_id', epicIds)
    .in('status', ['NO_GO', 'CONDITIONAL']);

  if (csError) {
    console.error('[v1-team-member-blockers] criteria_status fetch error:', csError);
    return internalError();
  }

  const now = Date.now();

  const data = (criteriaStatuses ?? []).map((cs) => {
    const criterion = cs.criterion as { label?: string; gate?: boolean } | null;
    const isGate = criterion?.gate ?? false;
    const label = criterion?.label ?? 'Unknown criterion';
    const severity = deriveSeverity(cs.status, isGate);
    const logged_at = cs.last_updated_at as string;
    const days_blocked = Math.floor((now - new Date(logged_at).getTime()) / 86400000);
    const needs_escalation = days_blocked >= 3 && (severity === 'high' || severity === 'critical');

    return {
      id: cs.id,
      epic_id: cs.epic_id,
      epic_name: epicNameById[cs.epic_id] ?? null,
      title: label,
      description: (cs.current_status_notes as string | null) ?? null,
      severity,
      status: 'open',
      days_blocked,
      needs_escalation,
      logged_at,
    };
  });

  return ok({ member: { id: member.id, name: member.name, email: member.email }, data });
};
