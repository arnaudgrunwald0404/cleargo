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
            // Check if it's a JWT validation error - this means the API key is invalid
            const isJWTError = error?.code === 'PGRST301' || 
                              error?.message?.includes('JWT') || 
                              error?.message?.includes('Expected 3 parts');
            
            if (isJWTError) {
                console.error('❌ Invalid Supabase API key detected!');
                console.error('   Error:', error?.message || 'JWT validation failed');
                console.error('   This usually means your API key in .env.local is malformed');
                console.error('   Check that SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is correct');
                console.error('   The key should be a JWT with 3 parts separated by dots');
                return [];
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

