import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { backfillActiveScorecardsToToday } from '@/lib/services/scorecardGenerationService';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin roles only
    const { resolveRole } = await import('@/lib/roles');
    const role = await resolveRole(user.email);
    const isAdmin = role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO';
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    });
  } catch (error: any) {
    console.error('Admin backfill failed:', error);
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}