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
    
    // Fallback: Use regular Supabase client without cookies if SERVICE_ROLE_KEY not available
    // This bypasses RLS but won't have cookie support (which is fine since auth is disabled)
    const fallbackClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    // Override getUser to return mock superadmin
    ;(fallbackClient.auth as any).getUser = async () => {
        const { getMockSuperAdmin } = await import('@/lib/auth-mock')
        return {
            data: { user: getMockSuperAdmin() },
            error: null,
        }
    }
    
    return fallbackClient
}
