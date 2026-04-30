/**
 * GET /api/roadmap/snapshots — list available `roadmap_snapshot` dates (newest first).
 * Auth required (universal read for any authenticated user). Rate limited.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';

export const dynamic = 'force-dynamic';

async function handler(): Promise<NextResponse> {
  const email = await getAuthenticatedUserEmail();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from('roadmap_snapshot')
    .select('snapshot_date, created_at')
    .order('snapshot_date', { ascending: false });
  if (error) {
    console.error('[api/roadmap/snapshots]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byDate = new Map<string, string>();
  for (const row of (data ?? []) as { snapshot_date: string; created_at: string }[]) {
    const d = row.snapshot_date;
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, row.created_at || d);
  }

  const snapshots = Array.from(byDate.entries())
    .map(([date, timestamp]) => ({ date, timestamp }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({ snapshots });
}

export const GET = withRateLimit(handler, RATE_LIMITS.light);
