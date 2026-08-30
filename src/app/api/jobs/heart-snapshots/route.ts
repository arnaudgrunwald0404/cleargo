/**
 * Scheduled job: Create daily HEART metric snapshots
 *
 * Production dashboards are snapshot-only (no live Pendo fan-out), so this job
 * is what keeps Success Metrics data fresh. Runs daily; computes each active
 * metric via the Pendo aggregation API and upserts into epic_heart_snapshots.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAllSnapshots } from '@/lib/heart/snapshot-calculator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = Date.now();
    const results = await createAllSnapshots();
    const totalSnapshots = results.reduce((sum, r) => sum + r.snapshotCount, 0);

    console.log(
      `[heart-snapshots] Created ${totalSnapshots} snapshots across ${results.length} epics in ${Date.now() - startedAt}ms`
    );

    return NextResponse.json({
      success: true,
      epics: results.length,
      snapshots: totalSnapshots,
      durationMs: Date.now() - startedAt,
      results,
    });
  } catch (error) {
    console.error('[heart-snapshots] Job failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
