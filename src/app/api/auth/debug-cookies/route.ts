import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const allCookies = request.cookies.getAll();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
    const codeVerifierCookieName = projectRef ? `sb-${projectRef}-auth-token-code-verifier` : null;

    const codeVerifierCookie = codeVerifierCookieName
        ? allCookies.find(c => c.name === codeVerifierCookieName)
        : allCookies.find(c => c.name.includes('code-verifier') || c.name.includes('code_verifier'));

    return NextResponse.json({
        cookies: allCookies.map(c => ({
            name: c.name,
            hasValue: !!c.value,
            valueLength: c.value?.length || 0,
            isCodeVerifier: c.name === codeVerifierCookieName || c.name.includes('code-verifier') || c.name.includes('code_verifier')
        })),
        codeVerifierCookie: codeVerifierCookie ? {
            name: codeVerifierCookie.name,
            hasValue: !!codeVerifierCookie.value,
            valueLength: codeVerifierCookie.value?.length || 0
        } : null,
        expectedCookieName: codeVerifierCookieName,
        projectRef,
        supabaseUrl,
        requestHost: request.headers.get('host'),
        requestOrigin: request.nextUrl.origin,
    });
}

