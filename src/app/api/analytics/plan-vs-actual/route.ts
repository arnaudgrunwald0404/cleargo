import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getPlanVsActualReport } from '@/lib/services/planVsActualService';
import type { PlanVsActualPeriodType } from '@/types/roadmap';

const PLAN_VS_ACTUAL_PERIOD_TYPES: PlanVsActualPeriodType[] = [
  'quarter_baseline',
  'quarter_progress',
  'quarterly',
];

export const dynamic = 'force-dynamic';
/** Allow RPC + release_schedule + comments to finish (Supabase fetch uses 120s for this RPC). */
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: appUser } = await supabase.from('app_user').select('roles').eq('email', user.email).single();
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules((appUser?.roles as string[]) || [], 'analytics.read', rules)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const periodType = searchParams.get('period_type') as PlanVsActualPeriodType | null;
    const periodDate = searchParams.get('period_date');

    if (!periodDate || !periodType || !PLAN_VS_ACTUAL_PERIOD_TYPES.includes(periodType)) {
      return NextResponse.json(
        {
          error:
            'Invalid or missing period_type (quarter_baseline|quarter_progress|quarterly) or period_date (yyyy-MM-dd)',
        },
        { status: 400 },
      );
    }

    const report = await getPlanVsActualReport(supabase, periodType, periodDate);
    return NextResponse.json(report);
  } catch (error: unknown) {
    console.error('[plan-vs-actual]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to load Plan vs Actual report', details: message }, { status: 500 });
  }
}
