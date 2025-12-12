import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

// AUTH DISABLED: Mock Supabase client that returns superadmin and bypasses RLS
export function createClient(): SupabaseClient {
    // AUTH DISABLED: Use SERVICE_ROLE key with regular Supabase client to bypass RLS
    // When auth is disabled, we need to bypass RLS which requires authenticated users
    // Using regular createClient (not createServerClient) with SERVICE_ROLE_KEY bypasses all RLS
    
    // Always use SERVICE_ROLE_KEY if available, otherwise use ANON_KEY
    // Both will work, but SERVICE_ROLE_KEY bypasses RLS
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    
    // If keys are missing, return a mock client that does nothing
    if (!supabaseKey || !supabaseUrl) {
        console.warn('Missing Supabase credentials, returning mock client');
        // Return a minimal mock client that won't crash
        const mockClient = {
            auth: {
                getUser: async () => {
                    const { getMockSuperAdmin } = await import('@/lib/auth-mock');
                    return { data: { user: getMockSuperAdmin() }, error: null };
                },
                getSession: async () => {
                    const { getMockSuperAdmin } = await import('@/lib/auth-mock');
                    const user = getMockSuperAdmin();
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
                    };
                },
            },
            from: () => ({
                select: () => ({ order: () => ({ data: [], error: null }) }),
                insert: () => ({ select: () => ({ data: null, error: null }) }),
                update: () => ({ eq: () => ({ select: () => ({ data: null, error: null }) }) }),
                delete: () => ({ eq: () => ({ data: null, error: null }) }),
            }),
        } as any as SupabaseClient;
        return mockClient;
    }
    
    const client = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        supabaseKey,
        {
            // Ensure we have all the methods that SSR client would have
            auth: {
                persistSession: false, // Not needed when auth is disabled
                autoRefreshToken: false,
                detectSessionInUrl: false,
                flowType: 'pkce',
            },
            global: {
                // Ensure fetch is available
                fetch: globalThis.fetch,
            }
        }
    )
    
    // Store original methods before overriding
    const originalGetUser = client.auth.getUser.bind(client.auth)
    const originalGetSession = (client.auth as any).getSession?.bind(client.auth)
    
    // Override getUser to return mock superadmin
    client.auth.getUser = async function() {
        const { getMockSuperAdmin } = await import('@/lib/auth-mock')
        return {
            data: { user: getMockSuperAdmin() },
            error: null,
        }
    }
    
    // Also override getSession to return mock session if it exists
    if (originalGetSession || typeof (client.auth as any).getSession === 'function') {
        (client.auth as any).getSession = async function() {
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
    }
    
    // Ensure all auth methods exist
    if (!(client.auth as any).getSession) {
        (client.auth as any).getSession = async function() {
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
    }
    
    return client
}
