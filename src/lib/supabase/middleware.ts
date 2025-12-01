import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

    // refreshing the auth token
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error) {
        console.log('⚠️ Middleware - getUser() error (may clear cookies):', error.message)
    } else if (user) {
        console.log('✅ Middleware - User session valid')
    } else {
        console.log('ℹ️ Middleware - No user session')
    }

    return response
}
