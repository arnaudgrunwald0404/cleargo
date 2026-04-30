/**
 * GET /api/roadmap/delivery-metrics?targetRelease=Release%202025.10
 *   → wraps `get_release_delivery_metrics(target_release)`. null target picks most-recent past.
 * GET /api/roadmap/delivery-metrics?asOfDate=YYYY-MM-DD&priorityGoals=1
 *   → wraps `get_priority_goals_delivery_metrics(as_of_date)`.
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
  const supabase = createClient();

  if (url.searchParams.get('priorityGoals')) {
    const asOfDate = url.searchParams.get('asOfDate');
    const { data, error } = await supabase.rpc('get_priority_goals_delivery_metrics', {
      as_of_date: asOfDate ?? null,
    } as { as_of_date: string | null });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ metrics: (data ?? [])[0] ?? null });
  }

  const targetRelease = url.searchParams.get('targetRelease');
  const { data, error } = await supabase.rpc('get_release_delivery_metrics', {
    target_release: targetRelease,
  } as { target_release: string | null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ metrics: data ?? [] });
}

export const GET = withRateLimit(handler, RATE_LIMITS.heavy);
