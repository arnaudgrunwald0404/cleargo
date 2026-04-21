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

  // ClearGO does not have a standalone blockers table — risk is tracked per epic via risk_level.
  return ok({ member: { id: member.id, name: member.name, email: member.email }, data: [] });
};
