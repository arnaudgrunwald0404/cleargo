import { createClient } from '@/lib/supabase/server';
import { CreateEpicDTO, Epic } from '@/types/epics';

export async function instantiateEpicMatrix(epicId: string, tier: string) {
    const supabase = createClient();

    // 1. Fetch all active criteria
    const { data: criteria, error: criteriaError } = await supabase
        .from('criterion')
        .select('*')
        .eq('is_active', true);

    if (criteriaError) {
        console.error('Error fetching criteria:', criteriaError);
        throw new Error('Failed to fetch criteria for instantiation');
    }

    if (!criteria || criteria.length === 0) {
        return; // Nothing to instantiate
    }

    // 2. Filter based on tier applicability
    // tier_applicability can be 'ALL', 'TIER_1_ONLY', 'TIER_1_AND_2'
    // If it's 'ALL', it applies to all tiers (TIER_1, TIER_2, TIER_3)
    // If it's 'TIER_1_ONLY', it applies only to TIER_1
    // If it's 'TIER_1_AND_2', it applies to TIER_1 and TIER_2
    // For TIER_3, only 'ALL' criteria apply

    const applicableCriteria = criteria.filter((c) => {
        // ALL criteria apply to all tiers
        if (c.tier_applicability === 'ALL') return true;
        // TIER_1_ONLY applies only to TIER_1
        if (c.tier_applicability === 'TIER_1_ONLY' && tier === 'TIER_1') return true;
        // TIER_1_AND_2 applies to TIER_1 and TIER_2
        if (c.tier_applicability === 'TIER_1_AND_2' && (tier === 'TIER_1' || tier === 'TIER_2')) return true;
        // For TIER_3, only ALL criteria apply (already handled above)
        return false;
    });

    if (applicableCriteria.length === 0) {
        return;
    }

    // 3. Prepare rows for epic_criterion_status
    const rows = applicableCriteria.map((c) => ({
        epic_id: epicId,
        criterion_id: c.id,
        status: 'NOT_SET',
    }));

    // 4. Insert rows
    const { error: insertError } = await supabase
        .from('epic_criterion_status')
        .insert(rows);

    if (insertError) {
        console.error('Error instantiating matrix:', insertError);
        throw new Error('Failed to insert epic criteria');
    }
}

export async function createEpic(data: CreateEpicDTO): Promise<Epic> {
    const supabase = createClient();

    // 1. Insert Epic
    const { data: epic, error } = await supabase
        .from('epic')
        .insert({
            name: data.name,
            tier: data.tier,
            product_id: data.product_id,
            owner_id: data.owner_id,
            target_launch_date: data.target_launch_date,
            aha_id: data.aha_id,
            aha_url: data.aha_url,
            status: 'PLANNED', // Default
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating epic:', error);
        throw error;
    }

    // 2. Instantiate Matrix
    await instantiateEpicMatrix(epic.id, epic.tier);

    return epic as Epic;
}

export async function getEpics() {
    // ALWAYS return empty array on any error - never throw
    try {
        // Use direct PostgREST request - Supabase JS client has issues with JWT keys
        // Direct requests work reliably with legacy JWT keys
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        
        if (serviceRoleKey && supabaseUrl) {
            try {
                // Try epic table first
                let response = await fetch(`${supabaseUrl}/rest/v1/epic?select=*&order=created_at.desc`, {
                    method: 'GET',
                    headers: {
                        'apikey': serviceRoleKey,
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    }
                });
                
                // If epic table doesn't exist, try launch table
                if (!response.ok && response.status === 404) {
                    response = await fetch(`${supabaseUrl}/rest/v1/launch?select=*&order=created_at.desc`, {
                        method: 'GET',
                        headers: {
                            'apikey': serviceRoleKey,
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=representation'
                        }
                    });
                }
                
                if (response.ok) {
                    const directData = await response.json();
                    if (directData && Array.isArray(directData)) {
                        return directData;
                    }
                }
            } catch (directError: any) {
                console.warn('Direct PostgREST request error:', directError?.message);
            }
        }
        
        let supabase;
        try {
            supabase = createClient();
        } catch (clientError: any) {
            console.warn('Failed to create Supabase client:', clientError?.message);
            return [];
        }

        // Try 'epic' table first, fallback to 'launch' if it doesn't exist
        let { data, error } = await supabase
            .from('epic')
            .select('*')
            .order('created_at', { ascending: false });
        
        // If epic table doesn't exist, try launch table
        if (error && (error.code === '42P01' || error.code === 'PGRST' || error.message?.includes('relation') || error.message?.includes('does not exist'))) {
            const retryResult = await supabase
                .from('launch')
                .select('*')
                .order('created_at', { ascending: false });
            data = retryResult.data;
            error = retryResult.error;
        }

        if (error) {
            // Check if it's a JWT validation error
            const isJWTError = error?.code === 'PGRST301' || 
                              error?.message?.includes('JWT') || 
                              error?.message?.includes('Expected 3 parts');
            
            if (isJWTError) {
                // Check which key format was actually used (from client metadata if available)
                const keyFormat = (supabase as any).__keyFormat;
                const usingNewFormat = keyFormat === 'new' || 
                    (!keyFormat && (process.env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_') || 
                                    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')));
                
                const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
                const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
                const hasLegacyKeys = !!serviceRoleKey || !!anonKey;
                
                if (usingNewFormat && hasLegacyKeys) {
                    // We have new keys but also legacy keys - try using legacy keys
                    console.warn('⚠️  New format keys detected but PostgREST doesn\'t support them yet.');
                    console.warn('   Attempting to use legacy keys instead...');
                    console.warn('   To avoid this warning, use legacy keys: SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY');
                    
                    // Try recreating client with legacy keys
                    try {
                        const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
                        const legacyKey = serviceRoleKey || anonKey;
                        const fallbackClient = createSupabaseClient(
                            process.env.NEXT_PUBLIC_SUPABASE_URL!,
                            legacyKey
                        );
                        
                        // Retry query with legacy client
                        const retryResult = await fallbackClient
                            .from('epic')
                            .select('*')
                            .order('created_at', { ascending: false });
                        
                        if (!retryResult.error) {
                            console.log('✅ Successfully used legacy keys for database query');
                            return retryResult.data || [];
                        }
                        
                        // If epic table doesn't exist, try launch table
                        if (retryResult.error && (retryResult.error.code === '42P01' || retryResult.error.message?.includes('does not exist'))) {
                            const launchResult = await fallbackClient
                                .from('launch')
                                .select('*')
                                .order('created_at', { ascending: false });
                            if (!launchResult.error) {
                                console.log('✅ Successfully used legacy keys for database query');
                                return launchResult.data || [];
                            }
                        }
                    } catch (fallbackError) {
                        console.error('Failed to use legacy keys:', fallbackError);
                    }
                }
                
                if (usingNewFormat) {
                    // PostgREST doesn't fully support new format keys yet - it expects JWT format
                    console.error('❌ PostgREST JWT validation error with new format Supabase keys');
                    console.error('   Error:', error?.message || 'JWT validation failed');
                    console.error('');
                    console.error('   ⚠️  SOLUTION: PostgREST (database queries) doesn\'t support new format keys yet.');
                    console.error('   Please use legacy JWT keys for now:');
                    console.error('');
                    console.error('   1. Go to Supabase Dashboard → Settings → API');
                    console.error('   2. Click on "Legacy anon, service_role API keys" tab');
                    console.error('   3. Copy the "anon" key to NEXT_PUBLIC_SUPABASE_ANON_KEY');
                    console.error('   4. Copy the "service_role" key to SUPABASE_SERVICE_ROLE_KEY');
                    console.error('   5. Restart your dev server');
                    console.error('');
                    return [];
                } else {
                    // Legacy JWT keys - check if this is a real error or something else
                    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
                    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
                    const hasLegacyKeys = !!serviceRoleKey || !!anonKey;
                    
                    if (hasLegacyKeys) {
                        // We have legacy keys but still getting JWT error
                        // According to Supabase docs: https://supabase.com/docs/guides/api/api-keys
                        // Legacy JWT keys should work with PostgREST, so this might indicate:
                        // - Invalid/expired keys
                        // - Key/project mismatch
                        // - PostgREST configuration issue
                        console.error('❌ Supabase API key validation error with legacy JWT keys');
                        console.error('   Error message:', error?.message || 'JWT validation failed');
                        console.error('   Error code:', error?.code || 'NO_CODE');
                        console.error('   Error details:', error?.details || 'No details');
                        console.error('   Error hint:', error?.hint || 'No hint');
                        console.error('');
                        console.error('   📚 Reference: https://supabase.com/docs/guides/api/api-keys');
                        console.error('');
                        
                        // Check which key is actually being used
                        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
                        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
                        const keyFormat = (supabase as any).__keyFormat;
                        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
                        
                        console.error('   Diagnostics:');
                        console.error('   - Key format detected:', keyFormat || 'unknown');
                        console.error('   - SUPABASE_SERVICE_ROLE_KEY present:', !!serviceRoleKey);
                        console.error('   - NEXT_PUBLIC_SUPABASE_ANON_KEY present:', !!anonKey);
                        console.error('   - Supabase URL:', supabaseUrl);
                        if (serviceRoleKey) {
                            console.error('   - Service role key length:', serviceRoleKey.length);
                            console.error('   - Service role key preview:', serviceRoleKey.substring(0, 50) + '...');
                            // Extract project ref from JWT if possible
                            try {
                                const parts = serviceRoleKey.split('.');
                                if (parts.length === 3) {
                                    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                                    console.error('   - JWT payload ref:', payload.ref || 'not found');
                                    console.error('   - JWT payload role:', payload.role || 'not found');
                                }
                            } catch (e) {
                                // Ignore JWT parsing errors
                            }
                        }
                        console.error('');
                        console.error('   Possible causes:');
                        console.error('   1. Key is invalid, expired, or for a different project');
                        console.error('   2. NEXT_PUBLIC_SUPABASE_URL doesn\'t match the key\'s project');
                        console.error('   3. PostgREST configuration issue');
                        console.error('   4. Network/connectivity problem');
                        console.error('');
                        console.error('   Solutions:');
                        console.error('   1. Verify keys in Supabase Dashboard → Settings → API → "Legacy anon, service_role API keys"');
                        console.error('   2. Ensure NEXT_PUBLIC_SUPABASE_URL matches your project');
                        console.error('   3. Copy fresh keys and restart dev server');
                        console.error('   4. Check Supabase project status page');
                    } else {
                        // No legacy keys found
                        console.error('❌ Supabase API key validation error detected!');
                        console.error('   Error:', error?.message || 'JWT validation failed');
                        console.error('   No legacy keys found in environment variables');
                        console.error('   Please set SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
                    }
                    return [];
                }
            }
            
            // Safely log other error information
            try {
                const errorInfo: any = {
                    message: error?.message || 'Unknown error',
                    code: error?.code || 'NO_CODE',
                };
                
                // Only add these if they exist
                if (error?.details) errorInfo.details = error.details;
                if (error?.hint) errorInfo.hint = error.hint;
                
                console.error('Database query error:', errorInfo.message, `(${errorInfo.code})`);
                if (errorInfo.details) console.error('  Details:', errorInfo.details);
                if (errorInfo.hint) console.error('  Hint:', errorInfo.hint);
            } catch (logError) {
                // If even logging fails, just return empty array
                console.error('Failed to log error details');
            }
            
            return [];
        }

        return data || [];
    } catch (error: any) {
        console.error('Exception in getEpics:', error?.message || String(error));
        return [];
    }
}

export async function getEpic(id: string) {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('epic')
        .select(`
      *,
      product:product_id (name),
      owner:app_user!owner_id (name, email, first_name, last_name, avatar_url),
      aha_fields
    `)
        .eq('id', id)
        .single();

    if (error) {
        // Return null for "not found" errors instead of throwing
        if (error.code === 'PGRST116') {
            return null;
        }
        throw error;
    }

    return data;
}

export async function updateEpic(id: string, updates: Partial<CreateEpicDTO>) {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('epic')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function deleteEpic(id: string) {
    const supabase = createClient();

    const { error } = await supabase
        .from('epic')
        .delete()
        .eq('id', id);

    if (error) {
        throw error;
    }
}

