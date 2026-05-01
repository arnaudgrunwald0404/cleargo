/**
 * POST /api/roadmap/visits
 *   Body: { snapshotDate: 'YYYY-MM-DD', page: 'snapshot' | 'rewind' }
 *   Records a visit by the authenticated user against a specific
 *   roadmap snapshot. One row per (user, snapshot_date, page) is
 *   maintained; subsequent visits during the same snapshot week
 *   bump `visit_count` and `last_visited_at` rather than creating
 *   duplicates.
 *
 *   Uses the service-role client so it works for both Supabase Auth
 *   and magic-link/lr_session users (both flows resolve through
 *   `getAuthenticatedUserEmail`).
 *
 * GET /api/roadmap/visits?snapshotDate=YYYY-MM-DD&page=snapshot
 *   Returns the per-user visit list for that snapshot+page so the UI
 *   can group by role and show recent visitors. Universal read for
 *   any authenticated user (matches the rest of the roadmap views).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';

export const dynamic = 'force-dynamic';

const trackSchema = z.object({
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  page: z.enum(['snapshot', 'rewind']),
});

async function postHandler(req: NextRequest): Promise<NextResponse> {
  const email = await getAuthenticatedUserEmail();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = trackSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.format() },
      { status: 400 },
    );
  }
  const { snapshotDate, page } = parsed.data;

  const admin = createAdminClient();

  const { data: userRow, error: lookupErr } = await admin
    .from('app_user')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (lookupErr) {
    console.error('[api/roadmap/visits] user lookup', lookupErr);
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }
  if (!userRow?.id) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }
  const appUserId = (userRow as { id: string }).id;

  // Try to bump an existing row first; fall back to insert if none exists.
  // (Using two statements is simpler than wiring a custom RPC and avoids
  //  upsert race conditions inflating the count by more than 1.)
  const { data: existing, error: readErr } = await admin
    .from('roadmap_visit')
    .select('id, visit_count')
    .eq('app_user_id', appUserId)
    .eq('snapshot_date', snapshotDate)
    .eq('page', page)
    .maybeSingle();
  if (readErr) {
    console.error('[api/roadmap/visits] read', readErr);
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  if (existing) {
    const { error: updErr } = await admin
      .from('roadmap_visit')
      .update({
        visit_count: (existing as { visit_count: number }).visit_count + 1,
        last_visited_at: new Date().toISOString(),
      })
      .eq('id', (existing as { id: string }).id);
    if (updErr) {
      console.error('[api/roadmap/visits] update', updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  } else {
    const { error: insErr } = await admin.from('roadmap_visit').insert({
      app_user_id: appUserId,
      snapshot_date: snapshotDate,
      page,
    });
    // Race-loser path: another concurrent insert won the unique constraint.
    // Treat 23505 as success — the other writer already recorded the visit.
    if (insErr && (insErr as { code?: string }).code !== '23505') {
      console.error('[api/roadmap/visits] insert', insErr);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

async function getHandler(req: NextRequest): Promise<NextResponse> {
  const email = await getAuthenticatedUserEmail();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const snapshotDate = url.searchParams.get('snapshotDate');
  const page = url.searchParams.get('page');
  if (!snapshotDate || !page) {
    return NextResponse.json(
      { error: 'snapshotDate and page are required' },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    return NextResponse.json({ error: 'Invalid snapshotDate' }, { status: 400 });
  }
  if (page !== 'snapshot' && page !== 'rewind') {
    return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('roadmap_visit')
    .select(
      `id,
       app_user_id,
       snapshot_date,
       page,
       first_visited_at,
       last_visited_at,
       visit_count,
       app_user:app_user_id (id, email, name, first_name, last_name, roles)`,
    )
    .eq('snapshot_date', snapshotDate)
    .eq('page', page)
    .order('last_visited_at', { ascending: false });
  if (error) {
    console.error('[api/roadmap/visits] list', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ visits: data ?? [] });
}

export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
