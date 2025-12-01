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
    
    console.log('🔍 OAuth Callback - Code:', code ? 'present' : 'missing')
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

    if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash,
        })
        if (!error) {
            // Create redirect and copy cookies with their original options
            const redirectResponse = NextResponse.redirect(new URL(next, request.url))
            storedCookies.forEach(({ name, value, options }) => {
                redirectResponse.cookies.set(name, value, options || {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'lax',
                    path: '/',
                })
            })
            return redirectResponse
        } else {
            console.error('OTP verification error:', error)
            const errorUrl = new URL('/?error=auth_failed', request.url)
            return NextResponse.redirect(errorUrl)
        }
    } else if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        
        if (error) {
            console.error('Code exchange error:', error)
            const errorUrl = new URL('/?error=auth_failed', request.url)
            errorUrl.searchParams.set('message', error.message)
            return NextResponse.redirect(errorUrl)
        }
        
        if (data?.session) {
            // Successfully exchanged code for session
            console.log('✅ Session created successfully')
            console.log('📦 Stored cookies count:', storedCookies.length)
            console.log('🍪 Cookies to copy:', storedCookies.map(c => ({ name: c.name, hasValue: !!c.value, options: c.options })))
            
            // Create redirect response and copy all cookies with their original options
            const redirectResponse = NextResponse.redirect(new URL(next, request.url))
            storedCookies.forEach(({ name, value, options }) => {
                const cookieOptions = options || {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'lax' as const,
                    path: '/',
                }
                redirectResponse.cookies.set(name, value, cookieOptions)
                console.log('🟡 Cookie copied to redirect:', name, 'Options:', JSON.stringify(cookieOptions))
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
