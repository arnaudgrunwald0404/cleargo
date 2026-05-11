import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { regeneratePlanVsActualItemNarrative } from '@/lib/services/planVsActualService';
import type { PlanVsActualPeriodType } from '@/types/roadmap';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
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
    if (!canRolesPerformWithRules((appUser?.roles as string[]) || [], 'roadmap.analysis.generate', rules)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json()) as {
      period_type?: PlanVsActualPeriodType;
      period_date?: string;
      aha_key?: string;
    };

    const periodType = body.period_type;
    const periodDate = body.period_date;
    const ahaKey = body.aha_key?.trim();

    if (
      !periodDate ||
      !periodType ||
      !['quarter_baseline', 'quarter_progress', 'quarterly'].includes(periodType)
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid or missing period_type (quarter_baseline|quarter_progress|quarterly) or period_date (yyyy-MM-dd)',
        },
        { status: 400 },
      );
    }
    if (!ahaKey) {
      return NextResponse.json({ error: 'aha_key is required' }, { status: 400 });
    }

    const result = await regeneratePlanVsActualItemNarrative(supabase, periodType, periodDate, ahaKey);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[plan-vs-actual/analysis/item]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to regenerate item narrative', details: message }, { status: 500 });
  }
}
