import { NextRequest, NextResponse } from 'next/server';
import { createEpic, getEpics } from '@/lib/epics';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const epics = await getEpics();
        return NextResponse.json(epics);
    } catch (error) {
        console.error('Error fetching epics:', error);
        return NextResponse.json({ error: 'Failed to fetch epics' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();

        // Basic validation
        if (!body.name || !body.tier) {
            return NextResponse.json({ error: 'Name and Tier are required' }, { status: 400 });
        }

        // Set owner to current user if not provided? 
        // Or maybe the UI sends it.
        // For now, let's allow the body to specify, but default to current user if logic requires.
        // But the `createEpic` DTO allows `owner_id`.

        const epic = await createEpic(body);
        return NextResponse.json(epic, { status: 201 });
    } catch (error) {
        console.error('Error creating epic:', error);
        return NextResponse.json({ error: 'Failed to create epic' }, { status: 500 });
    }
}
