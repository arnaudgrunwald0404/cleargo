import { validateApiKey } from './_shared/auth';
import { createAdminSupabase } from './_shared/supabase';
import { ok, notFound, unauthorized, badRequest, internalError } from './_shared/response';
import type { EpicSummary, EscalationItem, OneOnOnePrepDoc } from './_shared/types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'X-ClearGo-Key, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  if (!validateApiKey(req)) {
    return unauthorized();
  }

  const url = new URL(req.url);
  const person_id = url.searchParams.get('person_id');
  if (!person_id) {
    return badRequest('Missing required query param: person_id');
  }

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

  if (personError || !person) {
    return notFound('Person not found');
  }

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
    console.error('[v1-1on1-prep] active epics query error:', activeEpicsResult.error);
    return internalError();
  }
  if (completedResult.error) {
    console.error('[v1-1on1-prep] completed epics query error:', completedResult.error);
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

  // ClearGO tracks risk via epic.risk_level rather than a separate blocker table.
  // Surface high/critical-risk active epics as escalation-worthy items.
  const escalations_needed: EscalationItem[] = active_epics
    .filter((e) => e.risk_level === 'high' || e.risk_level === 'critical')
    .map((e) => ({
      blocker_id: e.id,
      epic_id: e.id,
      epic_name: e.name,
      blocker_title: `Epic is ${e.risk_level} risk`,
      severity: e.risk_level as 'high' | 'critical',
      days_blocked: 0,
    }));

  const suggested_talking_points: string[] = [];

  for (const esc of escalations_needed) {
    suggested_talking_points.push(
      `[RISK] ${esc.epic_name} is ${esc.severity} risk — review launch readiness`
    );
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
    person: {
      id: person.id,
      name: person.name,
      email: person.email,
      role: person.role,
    },
    summary: {
      active_epics: active_epics.length,
      completed_this_week: completed_this_week.length,
      open_blockers: 0,
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
