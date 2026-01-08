import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type') as EmailOtpType | null
    const next = searchParams.get('next') ?? '/'
    const code = searchParams.get('code')
    const access_token = searchParams.get('access_token')
    const refresh_token = searchParams.get('refresh_token')

    const requestUrl = new URL(request.url)
    
    // Redirect to production URL if called from preview branch
    // This ensures we never process OAuth callbacks on preview branches
    const hostname = requestUrl.hostname;
    const productionUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cleargo.netlify.app';
    const productionHostname = new URL(productionUrl).hostname;
    
    if (hostname !== productionHostname && hostname.includes('netlify.app')) {
        // This is a preview branch URL - redirect to production
        const productionCallbackUrl = new URL('/auth/callback', productionUrl);
        // Preserve all query parameters (especially the code)
        searchParams.forEach((value, key) => {
            productionCallbackUrl.searchParams.set(key, value);
        });
        console.log('🔄 Redirecting from preview branch to production:', {
            from: request.url,
            to: productionCallbackUrl.toString(),
        });
        return NextResponse.redirect(productionCallbackUrl);
    }
    
    // Log ALL parameters to debug what Supabase is sending
    console.log('🔍 Callback route - Full request details:', {
        url: request.url,
        pathname: requestUrl.pathname,
        search: requestUrl.search,
        allParams: Object.fromEntries(searchParams.entries()),
        hasCode: !!code,
        hasTokenHash: !!token_hash,
        hasAccessToken: !!access_token,
        referer: request.headers.get('referer'),
        origin: request.headers.get('origin'),
        hostname,
        productionHostname,
    })
    const response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // Create Supabase client - Supabase SSR handles cookies automatically
    // CRITICAL: Force read all cookies before creating client to ensure code_verifier is available
    const allCookiesBeforeClient = request.cookies.getAll()
    console.log('🔍 Cookies available before creating Supabase client:', {
        count: allCookiesBeforeClient.length,
        names: allCookiesBeforeClient.map(c => c.name),
        hasCodeVerifier: allCookiesBeforeClient.some(c => 
            c.name.includes('code-verifier') || c.name.includes('code_verifier')
        ),
    })

    // Validate Supabase URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
        console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
        return NextResponse.redirect(new URL('/login?error=config_error', requestUrl));
    }

    // Validate URL format
    if (!supabaseUrl.match(/^https:\/\/[^.]+\.supabase\.co$/)) {
        console.error('❌ Invalid Supabase URL format:', supabaseUrl);
        return NextResponse.redirect(new URL('/login?error=config_error', requestUrl));
    }

    // Use new publishable key, fallback to legacy anon key for backward compatibility
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!publishableKey) {
        console.error('❌ Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
        return NextResponse.redirect(new URL('/login?error=config_error', requestUrl));
    }

    const supabase = createServerClient(
        supabaseUrl,
        publishableKey,
        {
            cookies: {
                getAll() {
                    const cookies = request.cookies.getAll()
                    console.log('🔍 Supabase getAll() called:', {
                        count: cookies.length,
                        names: cookies.map(c => c.name),
                    })
                    return cookies
                },
                setAll(cookiesToSet) {
                    console.log('🔍 Supabase setAll() called:', {
                        count: cookiesToSet.length,
                        names: cookiesToSet.map(c => c.name),
                    })
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value)
                        response.cookies.set(name, value, options)
                    })
                },
            },
        }
    )

    // Handle password reset with access_token and refresh_token
    if (access_token && refresh_token && type === 'recovery') {
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
        })
        
        if (sessionError || !sessionData.session) {
            return NextResponse.redirect(new URL('/login?error=invalid_token', requestUrl))
        }
        
        return NextResponse.redirect(new URL('/reset-password', requestUrl))
    }

    // Handle email confirmation and other OTP types with token_hash
    if (token_hash && type) {
        if (type === 'recovery') {
            const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
                type: 'recovery',
                token_hash,
            })
            
            if (verifyError || !verifyData.session) {
                return NextResponse.redirect(new URL('/login?error=invalid_token', requestUrl))
            }
            
            return NextResponse.redirect(new URL('/reset-password', requestUrl))
        }
        
        // Handle other OTP types (email confirmation, magic link, etc.)
        const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash,
        })
        
        if (error) {
            return NextResponse.redirect(new URL('/login?error=auth_failed', requestUrl))
        }
        
        return NextResponse.redirect(new URL(next, requestUrl))
    }

    // Handle OAuth flows with code (PKCE)
    if (code) {
        // Check for code_verifier cookie before exchange
        // Supabase uses: sb-{project}-auth-token-code-verifier (not sb-{project}-auth-code-verifier)
        const allCookies = request.cookies.getAll()
        const projectRef = supabaseUrl.match(/                                                                                                                                  https:\/\/([^.]+)\.supabase\.co/)?.[1] || ''
        
        // Try both possible cookie name formats
        const codeVerifierCookieName1 = projectRef ? `sb-${projectRef}-auth-code-verifier` : null
        const codeVerifierCookieName2 = projectRef ? `sb-${projectRef}-auth-token-code-verifier` : null
        
        const codeVerifierCookie = codeVerifierCookieName2
            ? allCookies.find(c => c.name === codeVerifierCookieName2)
            : codeVerifierCookieName1
            ? allCookies.find(c => c.name === codeVerifierCookieName1)
            : allCookies.find(c => c.name.includes('code-verifier') || c.name.includes('code_verifier'))

        console.log('OAuth callback:', {
            hasCode: !!code,
            hasCodeVerifierCookie: !!codeVerifierCookie,
            codeVerifierCookieName1,
            codeVerifierCookieName2,
            foundCookieName: codeVerifierCookie?.name,
            allCookieNames: allCookies.map(c => c.name),
        })

        console.log('🔄 Attempting code exchange...', {
            codeLength: code.length,
            codePrefix: code.substring(0, 10),
            hasCodeVerifier: !!codeVerifierCookie,
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        });
        
        let exchangeResult;
        const exchangeStartTime = Date.now();
        try {
            console.log('⏳ Calling exchangeCodeForSession...');
            exchangeResult = await Promise.race([
                supabase.auth.exchangeCodeForSession(code),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Code exchange timeout after 10 seconds')), 10000)
                )
            ]) as { data: any; error: any };
            const exchangeDuration = Date.now() - exchangeStartTime;
            console.log(`⏱️ Code exchange completed in ${exchangeDuration}ms`);
        } catch (timeoutError: any) {
            const exchangeDuration = Date.now() - exchangeStartTime;
            console.error('❌ Code exchange timeout or error:', {
                error: timeoutError,
                duration: exchangeDuration,
                message: timeoutError?.message,
                stack: timeoutError?.stack,
            });
            const errorUrl = new URL('/login?error=auth_failed', requestUrl);
            errorUrl.searchParams.set('message', timeoutError?.message || 'Code exchange timed out');
            return NextResponse.redirect(errorUrl);
        }
        
        const { data, error } = exchangeResult;

        if (error) {
            console.error('❌ Code exchange error:', {
                message: error.message,
                status: error.status,
                hasCodeVerifier: !!codeVerifierCookie,
                errorDetails: error,
            })
            const errorUrl = new URL('/login?error=auth_failed', requestUrl)
            errorUrl.searchParams.set('message', error.message)
            return NextResponse.redirect(errorUrl)
        }

        console.log('✅ Code exchange result:', {
            hasSession: !!data?.session,
            hasUser: !!data?.user,
            sessionExpiresAt: data?.session?.expires_at,
            userId: data?.user?.id,
        });

        if (data?.session) {
            console.log('🔄 Redirecting to:', next);
            const redirectUrl = new URL(next, requestUrl);
            console.log('🔄 Full redirect URL:', redirectUrl.toString());
            // CRITICAL: Copy cookies from response to redirect response
            // Creating a new NextResponse.redirect() would lose the cookies set by setAll()
            const redirectResponse = NextResponse.redirect(redirectUrl);
            // Copy all cookies from the response that has the session cookies
            response.cookies.getAll().forEach(cookie => {
                redirectResponse.cookies.set(cookie.name, cookie.value, {
                    httpOnly: cookie.httpOnly,
                    secure: cookie.secure,
                    sameSite: cookie.sameSite as 'strict' | 'lax' | 'none' | undefined,
                    path: cookie.path,
                    maxAge: cookie.maxAge,
                    domain: cookie.domain,
                });
            });
            console.log('🍪 Cookies copied to redirect response:', {
                count: redirectResponse.cookies.getAll().length,
                names: redirectResponse.cookies.getAll().map(c => c.name),
            });
            return redirectResponse;
        }
        
        console.error('❌ Code exchange succeeded but no session returned');
    }

    // No valid auth parameters
    return NextResponse.redirect(new URL('/login?error=missing_code', requestUrl))
}
