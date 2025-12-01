import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type') as EmailOtpType | null
    const next = searchParams.get('next') ?? '/'
    const code = searchParams.get('code')

    const cookieStore = cookies()
    const response = NextResponse.redirect(new URL(next, request.url))

    // Create Supabase client with proper cookie handling for route handlers
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    cookieStore.set({ name, value, ...options })
                    response.cookies.set({ name, value, ...options })
                },
                remove(name: string, options: CookieOptions) {
                    cookieStore.set({ name, value: '', ...options })
                    response.cookies.set({ name, value: '', ...options })
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
            return response
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
            // Successfully exchanged code for session, cookies are set via the supabase client
            return response
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
