/**
 * Cron / scheduled job: warm Plan vs Actual AI cache for the prior calendar month (quarter_progress).
 * On Jan/Apr/Jul/Oct (month % 3 === 0), also warms the prior completed quarter.
 * GET with Authorization: Bearer CRON_SECRET (same pattern as other jobs).
 */

import { NextRequest, NextResponse } from 'next/server';
import { format, startOfMonth, startOfQuarter, subMonths } from 'date-fns';
import { createAdminClient } from '@/lib/supabase/server';
import { generateAndPersistPeriodAnalysis } from '@/lib/services/planVsActualService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const now = new Date();
    const prevMonthDate = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');

    const monthly = await generateAndPersistPeriodAnalysis(supabase, 'quarter_progress', prevMonthDate, {
      force: false,
    });

    let quarterly: {
      periodDate: string;
      fromCache: boolean;
      generatedAt: string;
    } | null = null;

    if (now.getMonth() % 3 === 0) {
      const prevQuarterStart = format(startOfQuarter(subMonths(startOfMonth(now), 3)), 'yyyy-MM-dd');
      const q = await generateAndPersistPeriodAnalysis(supabase, 'quarterly', prevQuarterStart, {
        force: false,
      });
      quarterly = {
        periodDate: prevQuarterStart,
        fromCache: q.fromCache,
        generatedAt: q.generatedAt,
      };
    }

    return NextResponse.json({
      ok: true,
      monthly: {
        periodDate: prevMonthDate,
        fromCache: monthly.fromCache,
        generatedAt: monthly.generatedAt,
      },
      quarterly,
    });
  } catch (error: unknown) {
    console.error('[roadmap-period-analysis]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
