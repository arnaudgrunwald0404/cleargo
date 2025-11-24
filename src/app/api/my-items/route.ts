import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch items where user is decision owner OR condition owner
        const { data, error } = await supabase
            .from('launch_criterion_status')
            .select(`
                *,
                launch:launch_id (id, name, target_launch_date, tier),
                criterion:criterion_id (label, category)
            `)
            .or(`decision_owner_id.eq.${user.id},condition_owner_id.eq.${user.id}`)
            .order('last_updated_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching my items:', error);
        return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
    }
}
