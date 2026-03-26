import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/auth-helpers';
import { createToken } from '@/lib/jwt';
import { getImpersonatedEmail, IMPERSONATE_COOKIE_NAME } from '@/lib/auth/impersonation';

export const dynamic = 'force-dynamic';

const COOKIE_MAX_AGE = 5 * 60;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const session = await getSession();
  const sessionEmail = session?.email;
  const realUserEmail = (user?.email || sessionEmail)?.toLowerCase();

  if (!realUserEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(realUserEmail)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const impersonateCookie = req.cookies.get(IMPERSONATE_COOKIE_NAME)?.value;

  const parsed = await getImpersonatedEmail(impersonateCookie);
  if (!parsed?.email) {
    return NextResponse.json({ error: 'No active impersonation' }, { status: 400 });
  }

  const targetEmail = parsed.email;

  if (isSuperAdmin(targetEmail)) {
    return NextResponse.json({ error: 'Invalid target' }, { status: 403 });
  }

  const { data: targetUser } = await supabase
    .from('app_user')
    .select('id, email')
    .eq('email', targetEmail)
    .single();

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const token = await createToken(
    { email: targetEmail, t: 'impersonate' },
    '5m',
  );

  const isProd = process.env.NODE_ENV === 'production';
  const response = NextResponse.json({ ok: true });
  response.cookies.set(IMPERSONATE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}
