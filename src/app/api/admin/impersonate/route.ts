import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/auth-helpers';
import { createToken } from '@/lib/jwt';
import { IMPERSONATE_COOKIE_NAME } from '@/lib/auth/impersonation';

export const dynamic = 'force-dynamic';

const COOKIE_MAX_AGE = 24 * 60 * 60; // 24h in seconds

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

  let targetEmail = '';
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    let body: { email?: string };
    try {
      body = await req.json();
      targetEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const email = formData.get('email');
    targetEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  }
  if (!targetEmail) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const { data: targetUser } = await supabase
    .from('app_user')
    .select('id, email')
    .eq('email', targetEmail)
    .single();

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (isSuperAdmin(targetEmail)) {
    return NextResponse.json({ error: 'Cannot impersonate another super admin' }, { status: 403 });
  }

  const token = await createToken(
    { email: targetEmail, t: 'impersonate' },
    COOKIE_MAX_AGE
  );

  const isProd = process.env.NODE_ENV === 'production';

  const html = '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/" /></head><body>Redirecting…</body></html>';
  const response = new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
  response.cookies.set(IMPERSONATE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}
