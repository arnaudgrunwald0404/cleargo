import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// This endpoint attempts to read the code_verifier from Supabase's internal storage
// It's a diagnostic endpoint to understand how Supabase stores PKCE data
export async function GET(request: NextRequest) {
    const supabase = createClient();

    // Try to get the code_verifier from Supabase's internal state
    // This might not work, but it's worth trying
    const { data: { session } } = await supabase.auth.getSession();

    // Check all cookies
    const allCookies = request.cookies.getAll();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
    const codeVerifierCookieName = projectRef ? `sb-${projectRef}-auth-code-verifier` : null;

    const codeVerifierCookie = codeVerifierCookieName
        ? allCookies.find(c => c.name === codeVerifierCookieName)
        : allCookies.find(c => c.name.includes('code-verifier') || c.name.includes('code_verifier'));

    return NextResponse.json({
        hasCodeVerifierCookie: !!codeVerifierCookie,
        codeVerifierCookieName,
        allCookieNames: allCookies.map(c => c.name),
        hasSession: !!session,
        projectRef
    });
}

