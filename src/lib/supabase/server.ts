import { createServerClient } from '@supabase/ssr'

// AUTH DISABLED: Mock Supabase client that returns superadmin
export function createClient() {
    const realClient = (() => {
        // Dynamically import cookies to avoid issues when this module is imported in client components
        const { cookies } = require('next/headers')
        
        return createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        const cookieStore = cookies()
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        try {
                            const cookieStore = cookies()
                            cookiesToSet.forEach(({ name, value, options }) => {
                                cookieStore.set({ name, value, ...options })
                            })
                        } catch (error) {
                            // The `setAll` method was called from a Server Component.
                            // This can be ignored if you have middleware refreshing
                            // user sessions.
                        }
                    },
                },
            }
        )
    })()

    // Override getUser to return mock superadmin
    const originalGetUser = realClient.auth.getUser.bind(realClient.auth)
    ;(realClient.auth as any).getUser = async () => {
        const { getMockSuperAdmin } = await import('@/lib/auth-mock')
        return {
            data: { user: getMockSuperAdmin() },
            error: null,
        }
    }

    return realClient
}
