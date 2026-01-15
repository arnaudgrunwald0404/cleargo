/**
 * Admin job: Backfill scorecards for all epics in active window (-90..+120) up to today.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backfillActiveScorecardsToToday } from '@/lib/services/scorecardGenerationService';

export const dynamic = 'force-dynamic';
export const maxDuration = 600; // allow up to 10 minutes

export async function POST(request: NextRequest) {
  try {
    // Allow either Vercel-Cron or Bearer CRON_SECRET
    const authHeader = request.headers.get('authorization');
    const vercelCron = request.headers.get('x-vercel-cron');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && !vercelCron && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const start = Date.now();
    const perEpic = await backfillActiveScorecardsToToday();
    const duration = Date.now() - start;

    const totals = perEpic.reduce(
      (acc, e) => {
        acc.totalDays += e.results.length;
        acc.succeeded += e.results.filter(r => r.success).length;
        acc.failed += e.results.filter(r => !r.success).length;
        return acc;
      },
      { totalDays: 0, succeeded: 0, failed: 0 }
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      epics: perEpic.length,
      total_days: totals.totalDays,
      succeeded: totals.succeeded,
      failed: totals.failed,
      results: perEpic.map(e => ({
        epicId: e.epicId,
        days: e.results.length,
        succeeded: e.results.filter(r => r.success).length,
        failed: e.results.filter(r => !r.success).length,
      })),
    });
  } catch (error: any) {
    console.error('Error in backfill-active-scorecards job:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}