import { validateApiKey } from './_shared/auth';
import { createAdminSupabase } from './_shared/supabase';
import { ok, notFound, unauthorized, badRequest, internalError } from './_shared/response';
import type { EpicSummary, Blocker, EscalationItem, OneOnOnePrepDoc } from './_shared/types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'X-ClearGo-Key, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function deriveSeverity(status: string, isGate: boolean): Blocker['severity'] {
  if (status === 'NO_GO') return isGate ? 'critical' : 'high';
  return 'medium'; // CONDITIONAL
}

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  if (!validateApiKey(req)) {
    return unauthorized();
  }

  const url = new URL(req.url);
  const person_id = url.searchParams.get('person_id');
  if (!person_id) return badRequest('Missing required query param: person_id');

  let supabase: ReturnType<typeof createAdminSupabase>;
  try {
    supabase = createAdminSupabase();
  } catch {
    return internalError();
  }

  const { data: person, error: personError } = await supabase
    .from('app_user')
    .select('id, name, email, role')
    .eq('id', person_id)
    .single();

  if (personError || !person) return notFound('Person not found');

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [activeEpicsResult, completedResult] = await Promise.all([
    supabase
      .from('epic')
      .select('id, name, status, tier, target_launch_date, risk_level, readiness_score, product:product_id(name)')
      .eq('owner_id', person_id)
      .not('status', 'in', '("LAUNCHED","CANCELLED","ARCHIVED","COMPLETED")'),
    supabase
      .from('epic')
      .select('id, name, status, tier, target_launch_date, risk_level, readiness_score, product:product_id(name)')
      .eq('owner_id', person_id)
      .in('status', ['LAUNCHED', 'COMPLETED'])
      .gte('updated_at', sevenDaysAgo),
  ]);

  if (activeEpicsResult.error) {
    console.error('[v1-1on1-prep] active epics error:', activeEpicsResult.error);
    return internalError();
  }
  if (completedResult.error) {
    console.error('[v1-1on1-prep] completed epics error:', completedResult.error);
    return internalError();
  }

  const toEpicSummary = (row: Record<string, unknown>): EpicSummary => {
    const product = row.product as Record<string, unknown> | null;
    return {
      id: row.id as string,
      name: row.name as string,
      status: row.status as string,
      tier: row.tier as string,
      target_launch_date: (row.target_launch_date as string | null) ?? null,
      risk_level: (row.risk_level as string | null) ?? null,
      readiness_score: (row.readiness_score as number | null) ?? null,
      product_name: product ? (product.name as string) : null,
    };
  };

  const active_epics: EpicSummary[] = (activeEpicsResult.data ?? []).map(toEpicSummary);
  const completed_this_week: EpicSummary[] = (completedResult.data ?? []).map(toEpicSummary);

  // Derive blockers from NO_GO / CONDITIONAL criteria on active epics
  const epicIds = active_epics.map((e) => e.id);
  const epicNameById: Record<string, string> = Object.fromEntries(active_epics.map((e) => [e.id, e.name]));

  let personBlockers: Blocker[] = [];

  if (epicIds.length > 0) {
    const { data: csData, error: csError } = await supabase
      .from('epic_criterion_status')
      .select('id, epic_id, status, current_status_notes, last_updated_at, criterion:criterion_id(label, gate)')
      .in('epic_id', epicIds)
      .in('status', ['NO_GO', 'CONDITIONAL']);

    if (csError) {
      console.error('[v1-1on1-prep] criteria_status error:', csError);
      return internalError();
    }

    const now = Date.now();
    personBlockers = (csData ?? []).map((cs) => {
      const criterion = cs.criterion as { label?: string; gate?: boolean } | null;
      const severity = deriveSeverity(cs.status, criterion?.gate ?? false);
      const logged_at = cs.last_updated_at as string;
      const days_blocked = Math.floor((now - new Date(logged_at).getTime()) / 86400000);
      return {
        id: cs.id as string,
        epic_id: cs.epic_id as string,
        epic_name: epicNameById[cs.epic_id as string] ?? '',
        title: (criterion?.label as string) ?? 'Unknown criterion',
        description: (cs.current_status_notes as string | null) ?? null,
        severity,
        status: 'open' as const,
        days_blocked,
        needs_escalation: days_blocked >= 3 && (severity === 'high' || severity === 'critical'),
        logged_at,
      };
    });
  }

  const escalations_needed: EscalationItem[] = personBlockers
    .filter((b) => b.needs_escalation)
    .map((b) => ({
      blocker_id: b.id,
      epic_id: b.epic_id,
      epic_name: b.epic_name,
      blocker_title: b.title,
      severity: b.severity,
      days_blocked: b.days_blocked,
    }));

  const suggested_talking_points: string[] = [];

  for (const esc of escalations_needed) {
    suggested_talking_points.push(
      `[ESCALATE] ${esc.epic_name}: ${esc.blocker_title} — blocked ${esc.days_blocked} days (${esc.severity})`
    );
  }

  for (const epic of active_epics) {
    if (epic.risk_level === 'high' || epic.risk_level === 'critical') {
      suggested_talking_points.push(
        `Review risk on '${epic.name}' — currently ${epic.risk_level} risk`
      );
    }
  }

  if (completed_this_week.length > 0) {
    suggested_talking_points.push(
      `Celebrate wins: ${completed_this_week.map((e) => e.name).join(', ')} shipped this week`
    );
  }

  const lowReadiness = active_epics.find(
    (e) => e.readiness_score !== null && e.readiness_score < 50
  );
  if (lowReadiness) {
    suggested_talking_points.push(
      `Check readiness blockers on ${lowReadiness.name} (score: ${lowReadiness.readiness_score}%)`
    );
  }

  if (suggested_talking_points.length === 0) {
    suggested_talking_points.push(
      'No critical items — discuss roadmap priorities and upcoming milestones'
    );
  }

  const doc: OneOnOnePrepDoc = {
    person: { id: person.id, name: person.name, email: person.email, role: person.role },
    summary: {
      active_epics: active_epics.length,
      completed_this_week: completed_this_week.length,
      open_blockers: personBlockers.length,
      escalations_needed: escalations_needed.length,
    },
    active_epics,
    completed_this_week,
    escalations_needed,
    suggested_talking_points,
    generated_at: new Date().toISOString(),
  };

  return ok(doc);
};
