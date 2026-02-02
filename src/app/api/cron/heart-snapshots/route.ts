/**
 * HEART Metrics Daily Snapshot Cron Job
 * 
 * This endpoint should be called daily by a scheduler (e.g., Vercel Cron, GitHub Actions)
 * to create historical snapshots for trend tracking.
 * 
 * Security: Requires CRON_SECRET environment variable to match
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
