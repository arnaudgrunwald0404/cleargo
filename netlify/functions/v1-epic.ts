import { validateApiKey } from './_shared/auth';
import { createAdminSupabase } from './_shared/supabase';
import { ok, notFound, unauthorized, badRequest, internalError } from './_shared/response';
import type { Blocker, Milestone, CriteriaSummary, EpicDetail } from './_shared/types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'X-ClearGo-Key, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function daysBlocked(loggedAt: string): number {
  const ms = Date.now() - new Date(loggedAt).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  if (!validateApiKey(req)) {
    return unauthorized();
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return badRequest('Missing required query param: id');
  }

  let supabase: ReturnType<typeof createAdminSupabase>;
  try {
    supabase = createAdminSupabase();
  } catch {
    return internalError();
  }

  const { data: epic, error: epicError } = await supabase
    .from('epic')
    .select('id, name, status, tier, target_launch_date, risk_level, readiness_score, owner_id, product_id')
    .eq('id', id)
    .single();

  if (epicError || !epic) {
    return notFound('Epic not found');
  }

  const [ownerResult, productResult] = await Promise.all([
    epic.owner_id
      ? supabase
          .from('app_user')
          .select('id, name, email')
          .eq('id', epic.owner_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    epic.product_id
      ? supabase
          .from('product')
          .select('id, name, pillar, pod')
          .eq('id', epic.product_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (ownerResult.error) {
    console.error('[v1-epic] owner query error:', ownerResult.error);
    return internalError();
  }
  if (productResult.error) {
    console.error('[v1-epic] product query error:', productResult.error);
    return internalError();
  }

  const [blockersResult, milestonesResult, criteriaResult] = await Promise.all([
    supabase
      .from('blocker')
      .select('id, epic_id, title, description, severity, status, logged_at')
      .eq('epic_id', id)
      .order('logged_at', { ascending: false }),
    supabase
      .from('epic_milestone')
      .select('id, name, due_date, completed_at, status')
      .eq('epic_id', id)
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('epic_criterion_status')
      .select('status')
      .eq('epic_id', id),
  ]);

  if (blockersResult.error) {
    console.error('[v1-epic] blockers query error:', blockersResult.error);
    return internalError();
  }
  if (milestonesResult.error) {
    console.error('[v1-epic] milestones query error:', milestonesResult.error);
    return internalError();
  }
  if (criteriaResult.error) {
    console.error('[v1-epic] criteria query error:', criteriaResult.error);
    return internalError();
  }

  const blockers: Blocker[] = (blockersResult.data ?? []).map((b) => {
    const severity = b.severity as Blocker['severity'];
    const days = daysBlocked(b.logged_at as string);
    return {
      id: b.id as string,
      epic_id: b.epic_id as string,
      epic_name: epic.name as string,
      title: b.title as string,
      description: (b.description as string | null) ?? null,
      severity,
      status: b.status as Blocker['status'],
      days_blocked: days,
      needs_escalation:
        (b.status as string) === 'open' &&
        days >= 3 &&
        (severity === 'high' || severity === 'critical'),
      logged_at: b.logged_at as string,
    };
  });

  const milestones: Milestone[] = (milestonesResult.data ?? []).map((m) => ({
    id: m.id as string,
    name: m.name as string,
    due_date: (m.due_date as string | null) ?? null,
    completed_at: (m.completed_at as string | null) ?? null,
    status: m.status as Milestone['status'],
  }));

  const criteriaRows = criteriaResult.data ?? [];
  const criteria_summary: CriteriaSummary = {
    total: criteriaRows.length,
    go: criteriaRows.filter((r) => r.status === 'GO').length,
    no_go: criteriaRows.filter((r) => r.status === 'NO_GO').length,
    conditional: criteriaRows.filter((r) => r.status === 'CONDITIONAL').length,
    not_set: criteriaRows.filter((r) => r.status === 'NOT_SET' || r.status === 'NOT_APPLICABLE').length,
  };

  const ownerData = ownerResult.data as { id: string; name: string; email: string } | null;
  const productData = productResult.data as { id: string; name: string; pillar: string; pod: string } | null;

  const detail: EpicDetail = {
    id: epic.id as string,
    name: epic.name as string,
    status: epic.status as string,
    tier: epic.tier as string,
    target_launch_date: (epic.target_launch_date as string | null) ?? null,
    risk_level: (epic.risk_level as string | null) ?? null,
    readiness_score: (epic.readiness_score as number | null) ?? null,
    owner: ownerData
      ? { id: ownerData.id, name: ownerData.name, email: ownerData.email }
      : null,
    product: productData
      ? { id: productData.id, name: productData.name, pillar: productData.pillar, pod: productData.pod }
      : null,
    blockers,
    milestones,
    criteria_summary,
  };

  return ok(detail);
};
