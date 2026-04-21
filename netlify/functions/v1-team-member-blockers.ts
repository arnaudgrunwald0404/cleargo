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
    console.error('[v1-team-member-blockers] Failed to fetch member:', memberError);
    return internalError();
  }

  const { data: blockers, error: blockersError } = await supabase
    .from('blocker')
    .select('id, epic_id, title, description, severity, status, logged_at, epic:epic_id!inner(name, owner_id)')
    .eq('status', 'open')
    .eq('epic.owner_id', id);

  if (blockersError) {
    console.error('[v1-team-member-blockers] Failed to fetch blockers:', blockersError);
    return internalError();
  }

  const now = Date.now();

  const data = (blockers ?? []).map((b) => {
    const days_blocked = Math.floor((now - new Date(b.logged_at).getTime()) / 86400000);
    const needs_escalation = days_blocked >= 3 && ['high', 'critical'].includes(b.severity);
    return {
      id: b.id,
      epic_id: b.epic_id,
      epic_name: (b.epic as { name?: string } | null)?.name ?? null,
      title: b.title,
      description: b.description,
      severity: b.severity,
      status: b.status,
      days_blocked,
      needs_escalation,
      logged_at: b.logged_at,
    };
  });

  return ok({ member: { id: member.id, name: member.name, email: member.email }, data });
};
