/**
 * Scheduled job: Refresh scorecards for epics within active window (launch → +180d)
 * Runs daily to create today's snapshot for in-window epics
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateActiveScorecardsForDate } from '@/lib/services/scorecardGenerationService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const vercelCron = request.headers.get('x-vercel-cron');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && !vercelCron && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date().toISOString().split('T')[0];

    const start = Date.now();
    const results = await generateActiveScorecardsForDate(today);
    const duration = Date.now() - start;

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      total: results.length,
      succeeded: successCount,
      failed: failureCount,
      results: results.map(r => ({ epicId: r.epicId, success: r.success, error: r.error })),
    });
  } catch (error: any) {
    console.error('Error in refresh-active-scorecards job:', error);
    return NextResponse.json({ success: false, error: error.message || 'Unknown error' }, { status: 500 });
  }
}