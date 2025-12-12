import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

// AUTH DISABLED: Mock Supabase client that returns superadmin and bypasses RLS
export function createClient(): SupabaseClient {
    // AUTH DISABLED: Use SERVICE_ROLE key with regular Supabase client to bypass RLS
    // When auth is disabled, we need to bypass RLS which requires authenticated users
    // Using regular createClient (not createServerClient) with SERVICE_ROLE_KEY bypasses all RLS
    
    // CRITICAL: Always use SECRET_KEY (or legacy SERVICE_ROLE_KEY) to bypass RLS and see all data
    // SECRET_KEY/SERVICE_ROLE_KEY bypasses all Row Level Security policies
    // 
    // NOTE: According to Supabase docs (https://supabase.com/docs/guides/api/api-keys):
    // - New keys (sb_publishable_/sb_secret_) are NOT JWTs and have known limitations with PostgREST
    // - Legacy JWT keys (anon/service_role) work reliably with PostgREST for database queries
    // - The Supabase JS client should handle new keys via API Gateway, but legacy keys are more reliable
    // 
    // Priority: legacy SERVICE_ROLE_KEY > new SECRET_KEY > legacy ANON_KEY > new PUBLISHABLE_KEY
    // We prefer legacy keys first for maximum compatibility with PostgREST
    // IMPORTANT: Always use legacy JWT keys for PostgREST queries to avoid "Expected 3 parts" errors
    let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''
    
    // Safety check: If we somehow got a new format key but legacy keys exist, use legacy instead
    if (supabaseKey.startsWith('sb_') && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️  Detected new format key but legacy SUPABASE_SERVICE_ROLE_KEY exists');
            console.warn('   Switching to legacy key for PostgREST compatibility');
        }
        supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else if (supabaseKey.startsWith('sb_') && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️  Detected new format key but legacy NEXT_PUBLIC_SUPABASE_ANON_KEY exists');
            console.warn('   Switching to legacy key for PostgREST compatibility');
        }
        supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    
    // Clean the key (remove quotes, whitespace, etc.)
    if (supabaseKey) {
        supabaseKey = supabaseKey.trim().replace(/^["']|["']$/g, '');
    }
    
    // Debug: Log what we're getting (only in development)
    if (process.env.NODE_ENV === 'development') {
        if (!supabaseKey) {
            console.warn('⚠️  No Supabase API key found in environment variables');
            console.warn('   SUPABASE_SECRET_KEY:', !!process.env.SUPABASE_SECRET_KEY);
            console.warn('   SUPABASE_SERVICE_ROLE_KEY (legacy):', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
            console.warn('   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:', !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
            console.warn('   NEXT_PUBLIC_SUPABASE_ANON_KEY (legacy):', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
            console.warn('   Check your .env.local file and restart your dev server');
        } else {
            // Check if it's a new format key (sb_publishable_ or sb_secret_)
            const isNewFormat = supabaseKey.startsWith('sb_publishable_') || supabaseKey.startsWith('sb_secret_');
            
            if (!isNewFormat) {
                // Legacy JWT format validation
                const parts = supabaseKey.split('.');
                if (parts.length !== 3) {
                    console.error('❌ API key format issue detected!');
                    console.error('   Key length:', supabaseKey.length);
                    console.error('   Key parts:', parts.length);
                    console.error('   Key preview:', supabaseKey.substring(0, 50) + '...');
                    console.error('   This usually means the key was truncated or corrupted');
                    console.error('   Check your .env.local file - make sure the key is on a single line');
                }
            }
        }
    }
    
    // Validate API key format - accepts both legacy JWT and new format
    const isValidSupabaseKey = (key: string): boolean => {
        if (!key) return false;
        
        // New format: starts with sb_publishable_ or sb_secret_
        if (key.startsWith('sb_publishable_') || key.startsWith('sb_secret_')) {
            // New Supabase keys are typically 100+ characters long
            // If it's very short or ends with a dash, it might be truncated
            if (key.length < 50) {
                if (process.env.NODE_ENV === 'development') {
                    console.warn('⚠️  New Supabase key appears to be truncated!');
                    console.warn('   Key length:', key.length);
                    console.warn('   Key preview:', key.substring(0, 50) + '...');
                    console.warn('   New Supabase keys are typically 100+ characters long');
                    console.warn('   Please check your .env.local file and ensure the key is complete');
                }
            }
            // Accept keys that are at least 20 chars (basic check)
            // But warn if they seem too short
            return key.length > 20;
        }
        
        // Legacy JWT format: should have 3 parts separated by dots
        const parts = key.split('.');
        const isValidJWT = parts.length === 3 && parts.every(part => part.length > 0);
        
        if (!isValidJWT && process.env.NODE_ENV === 'development') {
            console.error('❌ Invalid Supabase API key format!');
            console.error('   Key should be either:');
            console.error('   - Legacy JWT format (3 parts separated by dots)');
            console.error('   - New format (sb_publishable_... or sb_secret_...)');
            console.error('   Key length:', key.length);
            console.error('   Key preview:', key.substring(0, 50) + (key.length > 50 ? '...' : ''));
        }
        
        return isValidJWT;
    };
    
    // Validate the key format - if invalid, return mock client
    if (!supabaseKey || !isValidSupabaseKey(supabaseKey)) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️  Invalid or missing Supabase API key, using mock client');
            console.warn('   This means you won\'t see real data until the key is fixed');
            console.warn('   Check your .env.local file for SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)');
        }
        // Return mock client if key is invalid
        const mockClient = {
            auth: {
                getUser: async () => {
                    const { getMockSuperAdmin } = await import('@/lib/auth-mock');
                    return { data: { user: getMockSuperAdmin() }, error: null };
                },
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
        const usingSecretKey = !!process.env.SUPABASE_SECRET_KEY && !usingServiceRole;
        const usingAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !usingServiceRole && !usingSecretKey;
        const usingPublishableKey = !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !usingServiceRole && !usingSecretKey && !usingAnonKey;
        
        if (usingServiceRole) {
            console.log('✅ Using SUPABASE_SERVICE_ROLE_KEY (legacy) - RLS bypassed, full data access');
            console.log('   Key format: Legacy JWT');
            console.log('   Key length:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0);
            console.log('   Note: Legacy keys work with PostgREST. New keys (sb_secret_/sb_publishable_) are not yet supported.');
        } else if (usingSecretKey) {
            console.log('✅ Using SUPABASE_SECRET_KEY - RLS bypassed, full data access');
            console.log('   Key format: New format (sb_secret_...)');
            console.warn('   ⚠️  Warning: PostgREST may not support new format keys yet. Consider using legacy SUPABASE_SERVICE_ROLE_KEY.');
        } else if (usingAnonKey) {
            console.warn('⚠️  Using NEXT_PUBLIC_SUPABASE_ANON_KEY (legacy) - RLS may block data access');
            console.log('   Key format: Legacy JWT');
        } else if (usingPublishableKey) {
            console.warn('⚠️  Using NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY - RLS may block data access');
            console.log('   Key format: New format (sb_publishable_...)');
            console.warn('   ⚠️  Warning: PostgREST may not support new format keys yet. Consider using legacy NEXT_PUBLIC_SUPABASE_ANON_KEY.');
        } else {
            console.warn('⚠️  No valid Supabase key found - using mock client');
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
    
    // Store which key format we're using for error handling (before creating client)
    const isUsingNewFormat = supabaseKey.startsWith('sb_publishable_') || supabaseKey.startsWith('sb_secret_');
    const isUsingLegacyFormat = !isUsingNewFormat && supabaseKey.includes('.');
    
    // Create the Supabase client
    // Wrap fetch to log which key is being sent (for debugging)
    const originalFetch = globalThis.fetch;
    const debugFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
        if (process.env.NODE_ENV === 'development' && typeof url === 'string' && url.includes('supabase.co')) {
            const headers = options?.headers as Headers | Record<string, string> | undefined;
            
            // Extract all relevant headers
            let apikeyHeader: string | null = null;
            let authHeader: string | null = null;
            
            if (headers instanceof Headers) {
                apikeyHeader = headers.get('apikey');
                authHeader = headers.get('Authorization');
            } else if (headers && typeof headers === 'object') {
                apikeyHeader = (headers as any)['apikey'] || (headers as any)['Apikey'] || null;
                authHeader = (headers as any)['Authorization'] || (headers as any)['authorization'] || null;
            }
            
            const apikey = apikeyHeader || authHeader?.replace('Bearer ', '') || null;
            
            // Log both headers separately to see what PostgREST might be reading
            if (apikeyHeader) {
                const apikeyParts = apikeyHeader.split('.');
                console.log('🔍 apikey header:', {
                    preview: apikeyHeader.substring(0, 50) + '...',
                    length: apikeyHeader.length,
                    parts: apikeyParts.length,
                    isJWT: apikeyParts.length === 3,
                    matchesExpected: apikeyHeader === supabaseKey
                });
            }
            
            if (authHeader) {
                const authValue = authHeader.replace('Bearer ', '');
                const authParts = authValue.split('.');
                console.log('🔍 Authorization header:', {
                    preview: authValue.substring(0, 50) + '...',
                    length: authValue.length,
                    parts: authParts.length,
                    isJWT: authParts.length === 3,
                    matchesExpected: authValue === supabaseKey
                });
            }
            
            if (apikey) {
                const keyPreview = apikey.substring(0, 50);
                const isJWT = apikey.includes('.') && apikey.split('.').length === 3;
                const isNewFormat = apikey.startsWith('sb_');
                const parts = apikey.split('.');
                
                console.log('🔍 Combined key (apikey || Authorization):', {
                    preview: keyPreview + '...',
                    length: apikey.length,
                    format: isJWT ? 'JWT (legacy)' : isNewFormat ? 'New format' : 'Unknown',
                    parts: parts.length,
                    source: apikeyHeader ? 'apikey header' : authHeader ? 'Authorization header' : 'unknown',
                    matchesExpected: apikey === supabaseKey
                });
                
                // If it's not a JWT but should be, log warning
                if (!isJWT && supabaseKey.includes('.')) {
                    console.error('❌ PROBLEM: Sending non-JWT key but expected JWT!');
                    console.error('   Sent key format:', isNewFormat ? 'New format' : 'Unknown');
                    console.error('   Expected key format: JWT (legacy)');
                }
            } else {
                console.warn('⚠️  No API key found in request headers!');
                console.warn('   Headers:', headers instanceof Headers 
                    ? Array.from(headers.entries()).map(([k, v]) => `${k}: ${typeof v === 'string' ? v.substring(0, 30) + '...' : String(v)}`)
                    : Object.entries(headers || {}).map(([k, v]) => `${k}: ${typeof v === 'string' ? v.substring(0, 30) + '...' : String(v)}`));
            }
        }
        return originalFetch(url, options);
    };
    
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
                // Use debug fetch to see what key is actually being sent
                fetch: process.env.NODE_ENV === 'development' ? debugFetch : globalThis.fetch,
            },
            db: {
                schema: 'public',
            },
        }
    );
    
    // Store original methods before overriding
    const originalGetUser = client.auth.getUser.bind(client.auth)
    const originalGetSession = (client.auth as any).getSession?.bind(client.auth)
    
    // Override getUser to return mock superadmin
    // We return a user but NO session, because the service role key is sufficient for auth
    client.auth.getUser = async function() {
        const { getMockSuperAdmin } = await import('@/lib/auth-mock')
        return {
            data: { user: getMockSuperAdmin() },
            error: null,
        }
    }
    
    // Override getSession to return NO session when using service role key
    // This prevents the Supabase client from adding an Authorization header with a mock token
    // The service role key in the apikey header is sufficient for authentication
    if (originalGetSession || typeof (client.auth as any).getSession === 'function') {
        (client.auth as any).getSession = async function() {
            return {
                data: { session: null },
                error: null,
            }
        }
    }
    
    // Ensure all auth methods exist
    if (!(client.auth as any).getSession) {
        (client.auth as any).getSession = async function() {
            return {
                data: { session: null },
                error: null,
            }
        }
    }
    
    // Attach metadata to client for error handling (after all modifications)
    (client as any).__keyFormat = isUsingNewFormat ? 'new' : isUsingLegacyFormat ? 'legacy' : 'unknown';
    
    return client
}
