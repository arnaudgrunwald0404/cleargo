import { NextRequest, NextResponse } from 'next/server';
import { createEpic, getEpics } from '@/lib/epics';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            console.error('Auth error:', authError);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.log('Fetching epics for user:', user.email);
        // TODO: After migration 0018 is applied, table will be renamed from 'launch' to 'epic'
        const epics = await getEpics();
        console.log('Returning epics:', Array.isArray(epics) ? epics.length : 'not an array', epics);
        return NextResponse.json(epics);
    } catch (error: any) {
        console.error('Error fetching epics:', error);
        console.error('Error details:', error.message, error.stack);
        return NextResponse.json({ 
            error: 'Failed to fetch epics',
            details: error.message 
        }, { status: 500 });
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
