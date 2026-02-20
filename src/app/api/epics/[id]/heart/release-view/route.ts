/**
 * Epic HEART Release-Centric View API
 * GET - Baseline (pre-release 30d) and Month 1, 2, ... from stored snapshots
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEpicHeartReleaseView } from '@/lib/heart/service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await getEpicHeartReleaseView(epicId);
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[HEART release-view]', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
