import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { upsertPlanVsActualItemArr } from '@/lib/services/planVsActualService';
import type { PlanVsActualPeriodType } from '@/types/roadmap';

export const dynamic = 'force-dynamic';

const PERIOD_TYPES: PlanVsActualPeriodType[] = [
  'quarter_baseline',
  'quarter_progress',
  'quarterly',
];

export async function PATCH(req: NextRequest) {
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
    if (!canRolesPerformWithRules((appUser?.roles as string[]) || [], 'roadmap.planVsActual.arr.write', rules)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json()) as {
      period_type?: PlanVsActualPeriodType;
      period_date?: string;
      aha_key?: string;
      arr_impact?: string;
    };

    const periodType = body.period_type;
    const periodDate = body.period_date;
    const ahaKey = body.aha_key?.trim();
    if (!ahaKey || !periodDate || !periodType || !PERIOD_TYPES.includes(periodType)) {
      return NextResponse.json(
        { error: 'period_type, period_date, and aha_key are required' },
        { status: 400 },
      );
    }

    const result = await upsertPlanVsActualItemArr(
      supabase,
      periodType,
      periodDate,
      ahaKey,
      String(body.arr_impact ?? ''),
    );
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[plan-vs-actual/arr]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to save ARR', details: message }, { status: 500 });
  }
}
