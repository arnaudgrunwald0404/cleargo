import { createClient } from '@/lib/supabase/server';
import { CreateLaunchDTO, Launch } from '@/types/launches';

export async function instantiateLaunchMatrix(launchId: string, tier: string) {
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
    // tier_applicability can be 'ALL', 'TIER_1', 'TIER_2', 'TIER_3'
    // If it's 'ALL', it applies to everyone.
    // If it's a specific tier, it applies if the launch tier matches.
    // Note: We might want logic where TIER_1 includes TIER_2/3 criteria?
    // For now, let's assume strict matching or 'ALL'.
    // Actually, usually TIER_1 is the most strict, so it might include everything.
    // But the schema says `tier_applicability` is a single string.
    // Let's assume the rule is: if applicability is 'ALL' OR applicability == launch.tier.

    const applicableCriteria = criteria.filter((c) => {
        if (c.tier_applicability === 'ALL') return true;
        return c.tier_applicability === tier;
    });

    if (applicableCriteria.length === 0) {
        return;
    }

    // 3. Prepare rows for launch_criterion_status
    const rows = applicableCriteria.map((c) => ({
        launch_id: launchId,
        criterion_id: c.id,
        status: 'NOT_SET',
        decision_owner_role: c.decision_owner_role, // Store this? No, it's on the criterion.
        // We don't store role here, we resolve it dynamically or store the resolved user.
        // For now, just link them.
    }));

    // 4. Insert rows
    const { error: insertError } = await supabase
        .from('launch_criterion_status')
        .insert(rows);

    if (insertError) {
        console.error('Error instantiating matrix:', insertError);
        throw new Error('Failed to insert launch criteria');
    }
}

export async function createLaunch(data: CreateLaunchDTO): Promise<Launch> {
    const supabase = createClient();

    // 1. Insert Launch
    const { data: launch, error } = await supabase
        .from('launch')
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
        console.error('Error creating launch:', error);
        throw error;
    }

    // 2. Instantiate Matrix
    await instantiateLaunchMatrix(launch.id, launch.tier);

    return launch as Launch;
}

export async function getLaunches() {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('launch')
        .select(`
      *,
      product:product_id (name),
      owner:owner_id (name, email)
    `)
        .order('created_at', { ascending: false });

    if (error) {
        throw error;
    }

    return data;
}

export async function getLaunch(id: string) {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('launch')
        .select(`
      *,
      product:product_id (name),
      owner:owner_id (name, email)
    `)
        .eq('id', id)
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function updateLaunch(id: string, updates: Partial<CreateLaunchDTO>) {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('launch')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function deleteLaunch(id: string) {
    const supabase = createClient();

    const { error } = await supabase
        .from('launch')
        .delete()
        .eq('id', id);

    if (error) {
        throw error;
    }
}
