import { NextRequest, NextResponse } from 'next/server';
import { createSnapshot, getSnapshots } from '@/lib/snapshots';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { decision_type, verdict, notes } = body;

        if (!decision_type || !verdict) {
            return NextResponse.json({ error: 'Decision type and verdict are required' }, { status: 400 });
        }

        const snapshot = await createSnapshot(
            params.id,
            decision_type,
            verdict,
            notes,
            user.id
        );

        return NextResponse.json(snapshot, { status: 201 });
    } catch (error) {
        console.error('Error creating snapshot:', error);
        return NextResponse.json({ error: 'Failed to create snapshot' }, { status: 500 });
    }
}

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const snapshots = await getSnapshots(params.id);
        return NextResponse.json(snapshots);
    } catch (error) {
        console.error('Error fetching snapshots:', error);
        return NextResponse.json({ error: 'Failed to fetch snapshots' }, { status: 500 });
    }
}
