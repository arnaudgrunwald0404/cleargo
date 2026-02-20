/**
 * HEART Metrics Daily Snapshot Cron Job
 *
 * Writes one snapshot per metric per epic for *yesterday* (closed day) so we
 * accumulate immutable history. Run daily e.g. 01:00 UTC.
 *
 * Security: Requires CRON_SECRET (Bearer token in Authorization header).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createDailySnapshots } from '@/lib/heart/service';

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    console.log('[HEART Cron] Starting daily snapshot creation...');
    
    const result = await createDailySnapshots();
    
    console.log(`[HEART Cron] Completed: ${result.epicsProcessed} epics, ${result.snapshotsCreated} snapshots`);
    
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[HEART Cron] Failed:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Allow POST for flexibility with different cron providers
export async function POST(req: NextRequest) {
  return GET(req);
}
