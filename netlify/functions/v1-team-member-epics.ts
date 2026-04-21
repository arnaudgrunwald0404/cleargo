import { validateApiKey } from './_shared/auth';
import { createAdminSupabase } from './_shared/supabase';
import { ok, unauthorized, badRequest, notFound, internalError } from './_shared/response';

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
  const statusFilter = url.searchParams.get('status');

  if (!id) {
    return badRequest('id is required');
  }

  const supabase = createAdminSupabase();

  const { data: member, error: memberError } = await supabase
    .from('app_user')
    .select('id, name, email')
    .eq('id', id)
    .single();

  if (memberError) {
    if (memberError.code === 'PGRST116') {
      return notFound('Team member not found');
    }
    console.error('[v1-team-member-epics] Failed to fetch member:', memberError);
    return internalError();
  }

  let query = supabase
    .from('epic')
    .select('id, name, status, tier, target_launch_date, risk_level, readiness_score, product:product_id(name)')
    .eq('owner_id', id);

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data: epics, error: epicsError } = await query;

  if (epicsError) {
    console.error('[v1-team-member-epics] Failed to fetch epics:', epicsError);
    return internalError();
  }

  const data = (epics ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    status: e.status,
    tier: e.tier,
    target_launch_date: e.target_launch_date,
    risk_level: e.risk_level,
    readiness_score: e.readiness_score,
    product_name: (e.product as { name?: string } | null)?.name ?? null,
  }));

  return ok({ member: { id: member.id, name: member.name, email: member.email }, data });
};
