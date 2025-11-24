import { NextRequest, NextResponse } from 'next/server';
import { createLaunch, getLaunches } from '@/lib/launches';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const launches = await getLaunches();
        return NextResponse.json(launches);
    } catch (error) {
        console.error('Error fetching launches:', error);
        return NextResponse.json({ error: 'Failed to fetch launches' }, { status: 500 });
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
        // But the `createLaunch` DTO allows `owner_id`.

        const launch = await createLaunch(body);
        return NextResponse.json(launch, { status: 201 });
    } catch (error) {
        console.error('Error creating launch:', error);
        return NextResponse.json({ error: 'Failed to create launch' }, { status: 500 });
    }
}
