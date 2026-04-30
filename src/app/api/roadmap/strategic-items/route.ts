/**
 * GET /api/roadmap/strategic-items?category=…&period=…&asOfDate=YYYY-MM-DD
 * Wraps `get_strategic_items_detail(p_category, p_period, as_of_date)`.
 *   category ∈ csm-priority | with-goals | combined
 *   period   ∈ last-release | quarter | year
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';

export const dynamic = 'force-dynamic';

const VALID_CATEGORIES = new Set(['csm-priority', 'with-goals', 'combined']);
const VALID_PERIODS = new Set(['last-release', 'quarter', 'year']);

async function handler(req: NextRequest): Promise<NextResponse> {
  const email = await getAuthenticatedUserEmail();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const category = url.searchParams.get('category') ?? '';
  const period = url.searchParams.get('period') ?? '';
  const asOfDate = url.searchParams.get('asOfDate');

  if (!VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }
  if (!VALID_PERIODS.has(period)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_strategic_items_detail', {
    p_category: category,
    p_period: period,
    as_of_date: asOfDate ?? null,
  } as { p_category: string; p_period: string; as_of_date: string | null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data ?? [] });
}

export const GET = withRateLimit(handler, RATE_LIMITS.heavy);
