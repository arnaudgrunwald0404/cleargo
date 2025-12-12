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
    try {
        const supabase = createClient();

        const { data, error } = await supabase
            .from('epic')
            .select(`
          *,
          product:product_id (name),
          owner:app_user!owner_id (name, email, first_name, last_name, avatar_url),
          aha_fields
        `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching epics from database:', error);
            // Return empty array instead of throwing to prevent page crash
            return [];
        }

        console.log('Fetched epics from database:', data?.length || 0);
        return data || [];
    } catch (error) {
        console.error('Exception fetching epics:', error);
        // Return empty array instead of throwing to prevent page crash
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

