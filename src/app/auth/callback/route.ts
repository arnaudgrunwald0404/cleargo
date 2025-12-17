import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/dashboard';
  const code = searchParams.get('code');
  const access_token = searchParams.get('access_token');
  const refresh_token = searchParams.get('refresh_token');

  const requestUrl = new URL(request.url);
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Create Supabase client - Supabase SSR handles cookies automatically
  // CRITICAL: Force read all cookies before creating client to ensure code_verifier is available
  const allCookiesBeforeClient = request.cookies.getAll();
  console.log('🔍 Cookies available before creating Supabase client:', {
    count: allCookiesBeforeClient.length,
    names: allCookiesBeforeClient.map((c) => c.name),
    hasCodeVerifier: allCookiesBeforeClient.some(
      (c) => c.name.includes('code-verifier') || c.name.includes('code_verifier')
    ),
  });

  // Use new publishable key, fallback to legacy anon key for backward compatibility
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!publishableKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables'
    );
  }

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, publishableKey, {
    cookies: {
      getAll() {
        const cookies = request.cookies.getAll();
        console.log('🔍 Supabase getAll() called:', {
          count: cookies.length,
          names: cookies.map((c) => c.name),
        });
        return cookies;
      },
      setAll(cookiesToSet) {
        console.log('🔍 Supabase setAll() called:', {
          count: cookiesToSet.length,
          names: cookiesToSet.map((c) => c.name),
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Handle password reset with access_token and refresh_token
  if (access_token && refresh_token && type === 'recovery') {
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (sessionError || !sessionData.session) {
      return NextResponse.redirect(new URL('/login?error=invalid_token', requestUrl));
    }

    return NextResponse.redirect(new URL('/reset-password', requestUrl));
  }

  // Handle email confirmation and other OTP types with token_hash
  if (token_hash && type) {
    if (type === 'recovery') {
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        type: 'recovery',
        token_hash,
      });

      if (verifyError || !verifyData.session) {
        return NextResponse.redirect(new URL('/login?error=invalid_token', requestUrl));
      }

      return NextResponse.redirect(new URL('/reset-password', requestUrl));
    }

    // Handle other OTP types (email confirmation, magic link, etc.)
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (error) {
      return NextResponse.redirect(new URL('/login?error=auth_failed', requestUrl));
    }

    return NextResponse.redirect(new URL(next, requestUrl));
  }

  // Handle OAuth flows with code (PKCE)
  if (code) {
    // Check for code_verifier cookie before exchange
    // Supabase uses: sb-{project}-auth-token-code-verifier (not sb-{project}-auth-code-verifier)
    const allCookies = request.cookies.getAll();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';

    // Try both possible cookie name formats
    const codeVerifierCookieName1 = projectRef ? `sb-${projectRef}-auth-code-verifier` : null;
    const codeVerifierCookieName2 = projectRef ? `sb-${projectRef}-auth-token-code-verifier` : null;

    const codeVerifierCookie = codeVerifierCookieName2
      ? allCookies.find((c) => c.name === codeVerifierCookieName2)
      : codeVerifierCookieName1
        ? allCookies.find((c) => c.name === codeVerifierCookieName1)
        : allCookies.find(
            (c) => c.name.includes('code-verifier') || c.name.includes('code_verifier')
          );

    console.log('OAuth callback:', {
      hasCode: !!code,
      hasCodeVerifierCookie: !!codeVerifierCookie,
      codeVerifierCookieName1,
      codeVerifierCookieName2,
      foundCookieName: codeVerifierCookie?.name,
      allCookieNames: allCookies.map((c) => c.name),
    });

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Code exchange error:', {
        message: error.message,
        status: error.status,
        hasCodeVerifier: !!codeVerifierCookie,
      });
      const errorUrl = new URL('/login?error=auth_failed', requestUrl);
      errorUrl.searchParams.set('message', error.message);
      return NextResponse.redirect(errorUrl);
    }

    if (data?.session) {
      return NextResponse.redirect(new URL(next, requestUrl));
    }
  }

  // No valid auth parameters
  return NextResponse.redirect(new URL('/login?error=missing_code', requestUrl));
}
