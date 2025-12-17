import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveRole } from '@/lib/roles';

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()),
});

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse('Unauthorized', { status: 401 });
  const role = await resolveRole(user.email);
  if (!(role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO')) return forbid();

  // Capability check: users.delete
  const { data: me, error: userError } = await supabase
    .from('app_user')
    .select('roles')
    .eq('email', user.email)
    .single();

  // Handle case where user doesn't exist in app_user table
  if (userError && userError.code === 'PGRST116') {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }
  if (userError) {
    throw userError;
  }

  const { canRolesPerform } = await import('@/lib/permissions');
  const ok = await canRolesPerform((me?.roles as string[]) || [], 'users.delete');
  if (!ok) return forbid();

  const body = await req.json();
  const parsed = bulkDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { error } = await supabase.from('app_user').delete().in('id', parsed.data.ids);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to delete users', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: `Successfully deleted ${parsed.data.ids.length} user(s)` });
}
