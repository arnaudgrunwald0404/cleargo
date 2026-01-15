import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getEpicSuccessMetricHistory } from '@/lib/services/successMeasurementService';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters for filtering
    const searchParams = req.nextUrl.searchParams;
    const metricId = searchParams.get('metric_id');
    const changeType = searchParams.get('change_type');

    const history = await getEpicSuccessMetricHistory(epicId, {
      metricId: metricId || undefined,
      changeType: changeType as any || undefined,
    });

    return NextResponse.json(history);
  } catch (error: any) {
    console.error('Error fetching metric history:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch metric history', 
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
