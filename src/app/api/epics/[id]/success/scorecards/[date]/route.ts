import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getEpicScorecardByDate } from '@/lib/services/successMeasurementService';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; date: string }> }
) {
  try {
    const { id: epicId, date } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }

    const scorecard = await getEpicScorecardByDate(epicId, date);
    if (!scorecard) {
      return NextResponse.json({ error: 'Scorecard not found' }, { status: 404 });
    }

    return NextResponse.json(scorecard);
  } catch (error: any) {
    console.error('Error fetching epic scorecard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scorecard', details: error.message },
      { status: 500 }
    );
  }
}

