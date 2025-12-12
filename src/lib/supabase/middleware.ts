import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // Use new publishable key, fallback to legacy anon key for backward compatibility
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!publishableKey) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables');
    }

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        publishableKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    console.log('🔄 Middleware - Cookies being set/updated:', cookiesToSet.map(c => ({ name: c.name, hasValue: !!c.value, action: c.value ? 'set' : 'clear' })))
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    response = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) => {
                        response.cookies.set(name, value, options)
                        if (!value) {
                            console.log('⚠️ Middleware - Cookie being cleared:', name)
                        }
                    })
                },
            },
        }
    )

    // CRITICAL: Always call getUser() to refresh/sync the session
    // This ensures that sessions stored in localStorage (from createBrowserClient) 
    // are synced to cookies (for createServerClient) on the next request
    // Supabase SSR handles the sync automatically when getUser() is called
    // 
    // Note: getUser() reads from cookies, but Supabase SSR will automatically
    // sync sessions from the request if they exist. For signInWithPassword,
    // the session is in localStorage client-side, so we need to ensure it's
    // synced via a request that includes the session token.
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error) {
        // Only log if it's not a "missing session" error (which is normal for unauthenticated requests)
        if (!error.message.includes('Auth session missing') && !error.message.includes('JWTExpired')) {
            console.log('⚠️ Middleware - getUser() error:', error.message)
        }
    } else if (user) {
        console.log('✅ Middleware - User session valid:', user.email)
        // Session is valid - Supabase SSR has synced it to cookies automatically
    }

    return response
}
