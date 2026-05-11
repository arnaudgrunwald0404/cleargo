import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { generateAndPersistPeriodAnalysis, patchRoadmapPeriodAnalysis } from '@/lib/services/planVsActualService';
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
      force?: boolean;
    };

    const periodType = body.period_type;
    const periodDate = body.period_date;

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

    const result = await generateAndPersistPeriodAnalysis(supabase, periodType, periodDate, {
      force: body.force === true,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[plan-vs-actual/analysis]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to generate analysis', details: message }, { status: 500 });
  }
}

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
    if (!canRolesPerformWithRules((appUser?.roles as string[]) || [], 'roadmap.analysis.generate', rules)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json()) as {
      period_type?: PlanVsActualPeriodType;
      period_date?: string;
      overview?: string;
      themes?: string[];
      item_insight?: {
        aha_key: string;
        summary: string;
        likely_reasons: string;
        /** Optional; omit to preserve existing cached ARR text for this row. */
        arr_impact?: string;
      };
    };

    const periodType = body.period_type;
    const periodDate = body.period_date;
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

    const patch: Parameters<typeof patchRoadmapPeriodAnalysis>[3] = {};
    if (body.overview !== undefined) {
      patch.overview = String(body.overview);
    }
    if (body.themes !== undefined) {
      if (!Array.isArray(body.themes)) {
        return NextResponse.json({ error: 'themes must be an array of strings' }, { status: 400 });
      }
      patch.themes = body.themes.map((t) => String(t));
    }
    if (body.item_insight !== undefined) {
      if (!body.item_insight.aha_key || typeof body.item_insight.aha_key !== 'string') {
        return NextResponse.json({ error: 'item_insight.aha_key is required' }, { status: 400 });
      }
      patch.itemInsight = {
        ahaKey: body.item_insight.aha_key.trim(),
        summary: String(body.item_insight.summary ?? ''),
        likelyReasons: String(body.item_insight.likely_reasons ?? ''),
        ...(body.item_insight.arr_impact !== undefined
          ? { arrImpact: String(body.item_insight.arr_impact) }
          : {}),
      };
    }

    if (
      patch.overview === undefined &&
      patch.themes === undefined &&
      patch.itemInsight === undefined
    ) {
      return NextResponse.json(
        { error: 'Provide overview, themes, and/or item_insight' },
        { status: 400 },
      );
    }

    const result = await patchRoadmapPeriodAnalysis(supabase, periodType, periodDate, patch);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[plan-vs-actual/analysis PATCH]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to update analysis', details: message }, { status: 500 });
  }
}
