import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// AUTH DISABLED: Mock Supabase client that returns superadmin and bypasses RLS
export function createClient() {
    // AUTH DISABLED: Use SERVICE_ROLE key with regular Supabase client to bypass RLS
    // When auth is disabled, we need to bypass RLS which requires authenticated users
    // Using regular createClient (not createServerClient) with SERVICE_ROLE_KEY bypasses all RLS
    
    // Always use SERVICE_ROLE_KEY if available, otherwise use ANON_KEY
    // Both will work, but SERVICE_ROLE_KEY bypasses RLS
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    
    const client = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        supabaseKey,
        {
            // Ensure we have all the methods that SSR client would have
            auth: {
                persistSession: false, // Not needed when auth is disabled
                autoRefreshToken: false,
                detectSessionInUrl: false,
            }
        }
    )
    
    // Override getUser to return mock superadmin
    const originalGetUser = client.auth.getUser.bind(client.auth)
    client.auth.getUser = async () => {
        const { getMockSuperAdmin } = await import('@/lib/auth-mock')
        return {
            data: { user: getMockSuperAdmin() },
            error: null,
        }
    }
    
    // Also override getSession to return mock session
    ;(client.auth as any).getSession = async () => {
        const { getMockSuperAdmin } = await import('@/lib/auth-mock')
        const user = getMockSuperAdmin()
        return {
            data: { 
                session: {
                    user,
                    access_token: 'mock-token',
                    refresh_token: 'mock-refresh',
                    expires_in: 3600,
                    expires_at: Date.now() / 1000 + 3600,
                }
            },
            error: null,
        }
    }
    
    return client
}
