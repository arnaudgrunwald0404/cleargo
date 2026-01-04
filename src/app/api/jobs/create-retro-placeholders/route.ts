/**
 * Scheduled job: Create retro placeholders for eligible epics
 * Runs daily to create PENDING retros when epics reach T+30, T+60, T+90 days
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRetroPlaceholders } from '@/lib/services/retroPlaceholderService';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow up to 2 minutes for job execution

export async function GET(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Starting retro placeholder creation job...');
    const startTime = Date.now();

    const results = await createRetroPlaceholders();

    const endTime = Date.now();
    const duration = endTime - startTime;

    const createdCount = results.filter(r => r.created).length;
    const skippedCount = results.filter(r => !r.created && !r.error).length;
    const errorCount = results.filter(r => r.error).length;

    console.log(`Retro placeholder creation completed in ${duration}ms: ${createdCount} created, ${skippedCount} skipped, ${errorCount} errors`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      total: results.length,
      created: createdCount,
      skipped: skippedCount,
      errors: errorCount,
      results: results.map(r => ({
        epicId: r.epicId,
        epicName: r.epicName,
        dayMarker: r.dayMarker,
        created: r.created,
        error: r.error,
      })),
    });
  } catch (error: any) {
    console.error('Error in retro placeholder creation job:', error);
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

