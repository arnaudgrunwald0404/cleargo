/**
 * Scheduled job: Generate scorecards for eligible epics
 * Runs daily to create scorecard snapshots for launched epics
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateScorecardsForToday } from '@/lib/services/scorecardGenerationService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow up to 5 minutes for job execution

export async function GET(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    const vercelCron = request.headers.get('x-vercel-cron');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && !vercelCron && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Starting scorecard generation job...');
    const startTime = Date.now();

    const results = await generateScorecardsForToday();

    const endTime = Date.now();
    const duration = endTime - startTime;

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`Scorecard generation completed in ${duration}ms: ${successCount} succeeded, ${failureCount} failed`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      total: results.length,
      succeeded: successCount,
      failed: failureCount,
      results: results.map(r => ({
        epicId: r.epicId,
        success: r.success,
        error: r.error,
      })),
    });
  } catch (error: any) {
    console.error('Error in scorecard generation job:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

