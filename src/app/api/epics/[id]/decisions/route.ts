import { NextRequest, NextResponse } from 'next/server';
import { createDecision, getDecisions } from '@/lib/decisions';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
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

        const decision = await createDecision(
            id,
            decision_type,
            verdict,
            notes,
            user.id
        );

        return NextResponse.json(decision, { status: 201 });
    } catch (error) {
        console.error('Error creating decision:', error);
        return NextResponse.json({ error: 'Failed to log decision' }, { status: 500 });
    }
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const decisions = await getDecisions(id);
        return NextResponse.json(decisions);
    } catch (error) {
        console.error('Error fetching decisions:', error);
        return NextResponse.json({ error: 'Failed to fetch decisions' }, { status: 500 });
    }
}
