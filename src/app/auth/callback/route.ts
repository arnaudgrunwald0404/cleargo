import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type') as EmailOtpType | null
    const next = searchParams.get('next') ?? '/dashboard'
    const code = searchParams.get('code')
    const access_token = searchParams.get('access_token')
    const refresh_token = searchParams.get('refresh_token')

    console.log('🔍 Auth Callback - All params:', {
        code: code ? 'present' : 'missing',
        token_hash: token_hash ? 'present' : 'missing',
        type: type || 'none',
        access_token: access_token ? 'present' : 'missing',
        refresh_token: refresh_token ? 'present' : 'missing',
        next,
        fullUrl: request.url
    })
    console.log('🔍 Request URL:', request.url)
    console.log('🔍 Request origin:', request.nextUrl.origin)
    console.log('🔍 Request host:', request.headers.get('host'))
    console.log('🔍 Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('🔍 App URL:', process.env.NEXT_PUBLIC_APP_URL)
    console.log('🔍 Expected redirect URL:', `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/auth/callback`)

    // Check for domain mismatch
    const requestHost = request.headers.get('host')
    const expectedHost = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).host : null
    if (expectedHost && requestHost !== expectedHost) {
        console.warn('⚠️ Domain mismatch detected:', { requestHost, expectedHost })
    }

    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // Store cookies with their options for later copying
    const storedCookies: Array<{ name: string; value: string; options?: any }> = []

    // Create Supabase client using request cookies (like middleware pattern)
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    // Store cookies with their options
                    storedCookies.length = 0
                    console.log('🔵 Supabase setting cookies:', cookiesToSet.map(c => ({ name: c.name, hasValue: !!c.value, options: c.options })))
                    cookiesToSet.forEach(({ name, value, options }) => {
                        storedCookies.push({ name, value, options })
                        request.cookies.set(name, value)
                    })
                    // Create new response with cookies set
                    response = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) => {
                        response.cookies.set(name, value, options)
                        console.log('🟢 Cookie set on response:', name, 'Options:', JSON.stringify(options))
                    })
                },
            },
        }
    )

    // CRITICAL: Handle password reset tokens from Supabase's /auth/v1/verify endpoint
    // Supabase's verify endpoint redirects with access_token and refresh_token (not token_hash)
    // This happens BEFORE the token_hash check because verify endpoint uses tokens, not token_hash
    if (access_token && refresh_token && type === 'recovery') {
        console.log('🔍 Handling password reset tokens from Supabase verify endpoint')
        
        // Set session using the tokens from Supabase's verify redirect
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
        })
        
        if (sessionError || !sessionData.session) {
            console.error('❌ Failed to set session from password reset tokens:', sessionError)
            const errorUrl = new URL('/login?error=invalid_token', request.url)
            errorUrl.searchParams.set('message', 'Password reset link is invalid or has expired. Please request a new one.')
            return NextResponse.redirect(errorUrl)
        }
        
        console.log('✅ Password reset session set successfully:', {
            user: sessionData.user?.email,
            expiresAt: sessionData.session.expires_at
        })
        
        // Redirect to reset password page - user is now authenticated
        const redirectResponse = NextResponse.redirect(new URL('/reset-password', request.url))
        const cookieDomain = request.headers.get('host')?.split(':')[0] || undefined
        
        // Copy session cookies to response
        storedCookies.forEach(({ name, value, options }) => {
            const cookieOptions = options || {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax' as const,
                path: '/',
            }
            if (cookieDomain && !cookieDomain.includes('localhost')) {
                cookieOptions.domain = `.${cookieDomain.replace(/^www\./, '')}`
            }
            redirectResponse.cookies.set(name, value, cookieOptions)
            console.log('🍪 Setting password reset session cookie:', name, 'hasValue:', !!value)
        })
        
        return redirectResponse
    }

    if (token_hash && type) {
        // Handle password recovery separately - verify token and redirect to reset password page
        if (type === 'recovery') {
            const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
                type: 'recovery',
                token_hash,
            })
            
            if (verifyError) {
                console.error('Password recovery token verification error:', verifyError)
                const errorUrl = new URL('/login?error=invalid_token', request.url)
                errorUrl.searchParams.set('message', 'Password reset link is invalid or has expired')
                return NextResponse.redirect(errorUrl)
            }
            
            // CRITICAL: Verify that verifyOtp created a session
            if (!verifyData.session) {
                console.error('❌ verifyOtp succeeded but no session was created')
                const errorUrl = new URL('/login?error=no_session', request.url)
                errorUrl.searchParams.set('message', 'Password reset link verification failed. Please request a new one.')
                return NextResponse.redirect(errorUrl)
            }
            
            console.log('✅ Recovery token verified, session created:', {
                user: verifyData.user?.email,
                hasSession: !!verifyData.session,
                expiresAt: verifyData.session.expires_at,
                accessToken: verifyData.session.access_token ? 'present' : 'missing'
            })
            
            // CRITICAL: After verifyOtp, Supabase should have set session cookies via setAll
            // But we need to ensure they're properly set on the redirect response
            // The storedCookies array should contain the session cookies
            console.log('🔍 Stored cookies after verifyOtp:', storedCookies.map(c => ({ 
                name: c.name, 
                hasValue: !!c.value,
                valueLength: c.value?.length || 0
            })))
            
            // Token verified successfully - redirect to reset password page
            // The user is now authenticated via the recovery token, so they can update their password
            const redirectResponse = NextResponse.redirect(new URL('/reset-password', request.url))
            const cookieDomain = request.headers.get('host')?.split(':')[0] || undefined
            
            // Copy all cookies that Supabase set (including session cookies)
            // CRITICAL: These cookies contain the session that allows updateUser to work
            storedCookies.forEach(({ name, value, options }) => {
                const cookieOptions = options || {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax' as const,
                    path: '/',
                    maxAge: 60 * 60 * 24 * 365, // 1 year
                }
                if (cookieDomain && !cookieDomain.includes('localhost')) {
                    cookieOptions.domain = `.${cookieDomain.replace(/^www\./, '')}`
                }
                redirectResponse.cookies.set(name, value, cookieOptions)
                console.log('🍪 Setting recovery session cookie:', name, 'hasValue:', !!value, 'domain:', cookieOptions.domain || 'default')
            })
            
            // Verify cookies were set on the response
            const allCookies = redirectResponse.cookies.getAll()
            console.log('🔍 Cookies on redirect response:', allCookies.map(c => ({ name: c.name, hasValue: !!c.value })))
            
            // CRITICAL: Also add the session data to the URL as a fallback
            // This ensures the client-side can access the session even if cookies fail
            // But actually, we shouldn't do this for security - cookies should work
            // Instead, we'll rely on middleware to sync cookies to localStorage
            
            return redirectResponse
        }
        
        // Handle other OTP types (email confirmation, magic link, etc.)
        const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash,
        })
        if (!error) {
            // Create redirect and copy cookies with their original options
            const redirectResponse = NextResponse.redirect(new URL(next, request.url))
            const cookieDomain = request.headers.get('host')?.split(':')[0] || undefined
            storedCookies.forEach(({ name, value, options }) => {
                const cookieOptions = options || {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax' as const,
                    path: '/',
                }
                // Don't set domain for localhost
                if (cookieDomain && !cookieDomain.includes('localhost')) {
                    cookieOptions.domain = `.${cookieDomain.replace(/^www\./, '')}`
                }
                redirectResponse.cookies.set(name, value, cookieOptions)
                console.log('🍪 OTP Cookie set:', name, 'Domain:', cookieOptions.domain || 'default')
            })
            return redirectResponse
        } else {
            console.error('OTP verification error:', error)
            const errorUrl = new URL('/?error=auth_failed', request.url)
            return NextResponse.redirect(errorUrl)
        }
    } else if (code) {
        // CRITICAL: Google OAuth doesn't send a 'type' parameter - it's just a 'code'
        // Email confirmation links WILL have type='signup' or type='email'
        // So if type is present and is signup/email, handle as email confirmation
        // Otherwise, treat as OAuth flow (PKCE)
        if (type && (type === 'signup' || type === 'email')) {
            console.log('🔍 Handling email confirmation code - using verifyOtp (not PKCE)')
            const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
                type: type as EmailOtpType,
                token_hash: code, // Email confirmation codes can be used as token_hash
            })
            
            if (!otpError && otpData?.session) {
                console.log('✅ Email confirmation verified successfully')
                const redirectResponse = NextResponse.redirect(new URL(next, request.url))
                const cookieDomain = request.headers.get('host')?.split(':')[0] || undefined
                storedCookies.forEach(({ name, value, options }) => {
                    const cookieOptions = options || {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'lax' as const,
                        path: '/',
                    }
                    if (cookieDomain && !cookieDomain.includes('localhost')) {
                        cookieOptions.domain = `.${cookieDomain.replace(/^www\./, '')}`
                    }
                    redirectResponse.cookies.set(name, value, cookieOptions)
                })
                return redirectResponse
            } else {
                console.error('❌ Email confirmation verifyOtp error:', otpError)
                // Fall through to try exchangeCodeForSession as fallback
                console.log('⚠️ verifyOtp failed, trying exchangeCodeForSession as fallback')
            }
        }
        
        // Check if this is a recovery code (password reset) - recovery codes don't use PKCE
        // If type=recovery is present with a code, handle it differently
        if (type === 'recovery') {
            console.log('🔍 Handling recovery code (password reset) - attempting verifyOtp first')
            // Try verifyOtp first (for token_hash-based recovery)
            // If code is actually a token_hash, this will work
            const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
                type: 'recovery',
                token_hash: code, // Try using code as token_hash
            })
            
            if (!otpError && otpData?.session) {
                console.log('✅ Recovery verified via verifyOtp')
                const redirectResponse = NextResponse.redirect(new URL('/reset-password', request.url))
                const cookieDomain = request.headers.get('host')?.split(':')[0] || undefined
                storedCookies.forEach(({ name, value, options }) => {
                    const cookieOptions = options || {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'lax' as const,
                        path: '/',
                    }
                    if (cookieDomain && !cookieDomain.includes('localhost')) {
                        cookieOptions.domain = `.${cookieDomain.replace(/^www\./, '')}`
                    }
                    redirectResponse.cookies.set(name, value, cookieOptions)
                })
                return redirectResponse
            }
            
            // If verifyOtp failed, try exchangeCodeForSession (for PKCE-based recovery)
            // But recovery codes shouldn't require PKCE, so this might fail
            console.log('⚠️ verifyOtp failed, trying exchangeCodeForSession (may fail without PKCE)')
            const { data, error } = await supabase.auth.exchangeCodeForSession(code)
            
            if (error) {
                console.error('❌ Recovery code exchange error:', error)
                // If it's a PKCE error, provide a more helpful message
                if (error.message?.includes('code_verifier')) {
                    console.error('❌ Password reset is trying to use PKCE but code_verifier is missing')
                    console.error('❌ This suggests Supabase is using PKCE flow for password reset, which is incorrect')
                }
                const errorUrl = new URL('/login?error=invalid_token', request.url)
                errorUrl.searchParams.set('message', 'Password reset link is invalid or has expired. Please request a new one.')
                return NextResponse.redirect(errorUrl)
            }
            
            if (data?.session) {
                console.log('✅ Recovery code exchanged successfully')
                // Successfully exchanged recovery code - redirect to reset password page
                const redirectResponse = NextResponse.redirect(new URL('/reset-password', request.url))
                const cookieDomain = request.headers.get('host')?.split(':')[0] || undefined
                storedCookies.forEach(({ name, value, options }) => {
                    const cookieOptions = options || {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'lax' as const,
                        path: '/',
                    }
                    if (cookieDomain && !cookieDomain.includes('localhost')) {
                        cookieOptions.domain = `.${cookieDomain.replace(/^www\./, '')}`
                    }
                    redirectResponse.cookies.set(name, value, cookieOptions)
                })
                return redirectResponse
            }
        }
        
        // CRITICAL: Explicitly read all cookies before exchangeCodeForSession
        // Next.js lazily evaluates cookies, so we must force them to be read
        // This ensures the code_verifier cookie is available for PKCE flow
        const allCookies = request.cookies.getAll()
        console.log('🔍 All cookies before exchange:', allCookies.map(c => ({ name: c.name, hasValue: !!c.value })))

        // Find Supabase PKCE code verifier cookie (format: sb-<project-ref>-auth-code-verifier)
        // According to Supabase docs: https://supabase.com/docs/guides/auth/server-side/oauth-with-pkce-flow-for-ssr
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
        const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || ''
        const codeVerifierCookieName = projectRef ? `sb-${projectRef}-auth-code-verifier` : null
        const codeVerifierCookie = codeVerifierCookieName
            ? allCookies.find(c => c.name === codeVerifierCookieName)
            : allCookies.find(c => c.name.includes('code-verifier') || c.name.includes('code_verifier'))

        console.log('🔍 Code verifier cookie:', codeVerifierCookie
            ? { name: codeVerifierCookie.name, hasValue: !!codeVerifierCookie.value, valueLength: codeVerifierCookie.value?.length }
            : 'NOT FOUND')

        // If no code_verifier cookie and we have a type parameter, try verifyOtp first
        // Email confirmation links don't use PKCE, so they won't have code_verifier
        if (!codeVerifierCookie && type && (type === 'signup' || type === 'email' || type === 'magiclink')) {
            console.log('🔍 No code_verifier found, but type suggests email confirmation - trying verifyOtp')
            const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
                type: type as EmailOtpType,
                token_hash: code, // Try using code as token_hash
            })
            
            if (!otpError && otpData?.session) {
                console.log('✅ Email confirmation verified via verifyOtp')
                const redirectResponse = NextResponse.redirect(new URL(next, request.url))
                const cookieDomain = request.headers.get('host')?.split(':')[0] || undefined
                storedCookies.forEach(({ name, value, options }) => {
                    const cookieOptions = options || {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'lax' as const,
                        path: '/',
                    }
                    if (cookieDomain && !cookieDomain.includes('localhost')) {
                        cookieOptions.domain = `.${cookieDomain.replace(/^www\./, '')}`
                    }
                    redirectResponse.cookies.set(name, value, cookieOptions)
                })
                return redirectResponse
            } else {
                console.log('⚠️ verifyOtp failed, will try exchangeCodeForSession:', otpError?.message)
            }
        }

        if (!codeVerifierCookie && projectRef) {
            console.error('❌ PKCE code_verifier cookie missing!', {
                expectedName: codeVerifierCookieName,
                availableCookies: allCookies.map(c => c.name),
                projectRef,
                type: type || 'none'
            })
            // CRITICAL: If there's NO type parameter, this is likely an OAuth flow (Google SSO)
            // Email confirmation links will have type=signup or type=email
            // OAuth flows don't have a type parameter
            if (type && (type === 'signup' || type === 'email')) {
                // This is an email confirmation that should have been handled above
                const errorUrl = new URL('/login?error=invalid_token', request.url)
                errorUrl.searchParams.set('message', 'Email confirmation link is invalid or has expired. Please request a new confirmation email.')
                return NextResponse.redirect(errorUrl)
            }
            // For OAuth flows (no type parameter = Google SSO), if code_verifier is missing, provide helpful error
            // This usually means cookies aren't being set properly (domain/path/SameSite issues)
            const errorUrl = new URL('/login?error=oauth_failed', request.url)
            errorUrl.searchParams.set('message', 'OAuth authentication failed: missing security token. Please try signing in again. If the problem persists, check your browser cookie settings.')
            return NextResponse.redirect(errorUrl)
        }

        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) {
            console.error('❌ Code exchange error:', error)
            console.error('❌ Error details:', {
                message: error.message,
                status: error.status,
                codeVerifierPresent: !!codeVerifierCookie,
                allCookieNames: allCookies.map(c => c.name)
            })
            
            // Provide more helpful error messages based on the error type
            let errorMessage = error.message
            if (error.message?.includes('code_verifier') || error.message?.includes('code verifier')) {
                errorMessage = 'OAuth authentication failed: security token missing. This may be due to cookie restrictions. Please try signing in again and ensure cookies are enabled.'
            }
            
            const errorUrl = new URL('/login?error=auth_failed', request.url)
            errorUrl.searchParams.set('message', errorMessage)
            return NextResponse.redirect(errorUrl)
        }

        if (data?.session) {
            // Successfully exchanged code for session
            console.log('✅ Session created successfully')
            console.log('📦 Stored cookies count:', storedCookies.length)
            console.log('🍪 Cookies to copy:', storedCookies.map(c => ({ name: c.name, hasValue: !!c.value, options: c.options })))

            // Create redirect response and copy all cookies with their original options
            const redirectResponse = NextResponse.redirect(new URL(next, request.url))
            const cookieDomain = request.headers.get('host')?.split(':')[0] || undefined
            storedCookies.forEach(({ name, value, options }) => {
                const cookieOptions = options || {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax' as const,
                    path: '/',
                }
                // Don't set domain for localhost
                if (cookieDomain && !cookieDomain.includes('localhost')) {
                    cookieOptions.domain = `.${cookieDomain.replace(/^www\./, '')}`
                }
                // Log maxAge/expires if present
                if (options?.maxAge) {
                    console.log('⏰ Cookie maxAge:', name, options.maxAge, 'seconds')
                }
                redirectResponse.cookies.set(name, value, cookieOptions)
                console.log('🟡 Cookie copied to redirect:', name, 'Domain:', cookieOptions.domain || 'default', 'Options:', JSON.stringify(cookieOptions))
            })

            // Log final cookie headers
            console.log('📋 Final redirect response cookies:', redirectResponse.cookies.getAll().map(c => c.name))
            return redirectResponse
        } else {
            console.error('No session returned from code exchange')
            const errorUrl = new URL('/?error=auth_failed', request.url)
            errorUrl.searchParams.set('message', 'No session returned')
            return NextResponse.redirect(errorUrl)
        }
    }

    // No code or token_hash provided
    const errorUrl = new URL('/?error=missing_code', request.url)
    return NextResponse.redirect(errorUrl)
}
