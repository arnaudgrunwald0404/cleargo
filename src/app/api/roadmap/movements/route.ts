/**
 * GET /api/roadmap/movements?asOfDate=YYYY-MM-DD&horizon=weekly|quarterly|ytd|year
 * Wraps the movement RPCs (yearly + impact-categorized + delivery metrics).
 * Auth required; rate limited as a "heavy" endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';

export const dynamic = 'force-dynamic';

async function handler(req: NextRequest): Promise<NextResponse> {
  const email = await getAuthenticatedUserEmail();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const asOfDate = url.searchParams.get('asOfDate');
  const horizon = url.searchParams.get('horizon') ?? 'all';

  const supabase = createClient();
  const dateArg = asOfDate
    ? { as_of_date: asOfDate }
    : ({ as_of_date: null } as { as_of_date: string | null });

  if (horizon === 'impact') {
    const { data, error } = await supabase.rpc('get_year_movements_with_impact', dateArg);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ movements: data ?? [] });
  }

  if (horizon === 'year' || horizon === 'all') {
    const { data, error } = await supabase.rpc('get_all_year_release_movements', dateArg);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ movements: data ?? [] });
  }

  const releasesArg = { releases: null } as { releases: string[] | null };
  const rpcName =
    horizon === 'weekly'
      ? 'get_weekly_roadmap_changes'
      : horizon === 'quarterly'
        ? 'get_quarter_to_date_roadmap_changes'
        : horizon === 'ytd'
          ? 'get_year_to_date_roadmap_changes'
          : null;
  if (!rpcName) return NextResponse.json({ error: 'Invalid horizon' }, { status: 400 });

  const { data, error } = await supabase.rpc(rpcName, releasesArg);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ movements: data ?? [] });
}

export const GET = withRateLimit(handler, RATE_LIMITS.heavy);
