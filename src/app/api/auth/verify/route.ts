import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, createToken } from '@/lib/jwt';
import { isTokenUsed, markTokenUsed } from '@/lib/tokenStore';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  try {
    const payload = await verifyToken<{ email: string; jti: string; t: string }>(token);
    if (payload.t !== 'magic') throw new Error('Wrong token type');
    const used = await isTokenUsed(payload.jti);
    if (used) return NextResponse.json({ error: 'Link already used' }, { status: 400 });

    await markTokenUsed(payload.jti);

    // Issue session cookie (7 days)
    const session = await createToken({ email: payload.email, t: 'session' }, '7d');
    const res = NextResponse.redirect(new URL('/', req.url));
    res.cookies.set({
      name: 'lr_session',
      value: session,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
  }
}
