import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    const supabase = createClient();
    // Fetch distinct pod values from launch table
    const { data, error } = await supabase
        .from('launch')
        .select('pod')
        .neq('pod', null)
        .order('pod', { ascending: true });
    if (error) {
        console.error('Error fetching pods:', error);
        return NextResponse.json({ error: 'Failed to fetch pods' }, { status: 500 });
    }
    // Extract distinct pods
    const podsSet = new Set<string>();
    data.forEach((row) => {
        if (row.pod) podsSet.add(row.pod);
    });
    const pods = Array.from(podsSet);
    return NextResponse.json({ pods });
}
