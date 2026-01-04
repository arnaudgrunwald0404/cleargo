import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import {
  getSuccessMetricsSummary,
  getEpicsWithSuccessData,
  getEpicsNeedingAttention,
  getTopPerformingEpics,
} from '@/lib/services/successDashboardService';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filters = {
      tier: searchParams.get('tier') || undefined,
      status: searchParams.get('status') || undefined,
      dateRangeStart: searchParams.get('date_range_start') || undefined,
      dateRangeEnd: searchParams.get('date_range_end') || undefined,
    };

    const view = searchParams.get('view') || 'summary'; // summary, list, attention, top

    switch (view) {
      case 'summary':
        const summary = await getSuccessMetricsSummary(filters);
        return NextResponse.json(summary);

      case 'list': {
        const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
        const epics = await getEpicsWithSuccessData(filters, limit);
        return NextResponse.json(epics);
      }

      case 'attention': {
        const epics = await getEpicsNeedingAttention();
        return NextResponse.json(epics);
      }

      case 'top': {
        const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 10;
        const epics = await getTopPerformingEpics(limit);
        return NextResponse.json(epics);
      }

      default:
        return NextResponse.json({ error: 'Invalid view parameter' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error fetching success metrics dashboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data', details: error.message },
      { status: 500 }
    );
  }
}

