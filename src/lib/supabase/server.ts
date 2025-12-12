import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

// AUTH DISABLED: Mock Supabase client that returns superadmin and bypasses RLS
export function createClient(): SupabaseClient {
    // AUTH DISABLED: Use SERVICE_ROLE key with regular Supabase client to bypass RLS
    // When auth is disabled, we need to bypass RLS which requires authenticated users
    // Using regular createClient (not createServerClient) with SERVICE_ROLE_KEY bypasses all RLS
    
    // CRITICAL: Always use SERVICE_ROLE_KEY to bypass RLS and see all data
    // SERVICE_ROLE_KEY bypasses all Row Level Security policies
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    
    // Validate JWT format (should have 3 parts separated by dots)
    const isValidJWT = (key: string): boolean => {
        if (!key) return false;
        const parts = key.split('.');
        return parts.length === 3 && parts.every(part => part.length > 0);
    };
    
    // Validate the key format
    if (supabaseKey && !isValidJWT(supabaseKey)) {
        console.error('❌ Invalid Supabase API key format!');
        console.error('   Key should be a JWT with 3 parts (header.payload.signature)');
        console.error('   Key length:', supabaseKey.length);
        console.error('   Key starts with:', supabaseKey.substring(0, 20) + '...');
        console.error('   Key parts:', supabaseKey.split('.').length);
        // Return mock client if key is invalid
        const mockClient = {
            auth: {
                getUser: async () => ({ data: { user: getMockSuperAdmin() }, error: null }),
                getSession: async () => ({ data: { session: null }, error: null }),
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
    
    // Log which key we're using (only in development)
    if (process.env.NODE_ENV === 'development') {
        const usingServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (usingServiceRole) {
            console.log('✅ Using SERVICE_ROLE_KEY - RLS bypassed, full data access');
        } else {
            console.warn('⚠️  Using ANON_KEY - RLS may block data access');
        }
    }
    
    // If keys are missing, return a mock client that does nothing
    if (!supabaseKey || !supabaseUrl) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️  Missing Supabase credentials, using mock client');
        }
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
        supabaseUrl,
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
            },
            db: {
                schema: 'public',
            },
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
