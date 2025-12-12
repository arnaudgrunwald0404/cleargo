import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// AUTH DISABLED: Mock Supabase client that returns superadmin and bypasses RLS
export function createClient() {
    // AUTH DISABLED: Use SERVICE_ROLE key with regular Supabase client to bypass RLS
    // When auth is disabled, we need to bypass RLS which requires authenticated users
    // Using regular createClient (not createServerClient) with SERVICE_ROLE_KEY bypasses all RLS
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const serviceRoleClient = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        
        // Override getUser to return mock superadmin
        ;(serviceRoleClient.auth as any).getUser = async () => {
            const { getMockSuperAdmin } = await import('@/lib/auth-mock')
            return {
                data: { user: getMockSuperAdmin() },
                error: null,
            }
        }
        
        return serviceRoleClient
    }
    
    // Fallback to SSR client if SERVICE_ROLE_KEY not available
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
