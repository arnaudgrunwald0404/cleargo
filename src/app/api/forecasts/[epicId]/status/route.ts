import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const REVIEW_STATUSES = ['draft', 'ready_for_review', 'in_review', 'aligned'] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// PATCH /api/forecasts/[epicId]/status
// Updates the review_status of the current forecast run for this epic. Separate from
// forecast_runs.status, which tracks generation lifecycle (pending/running/complete/error).
async function patchHandler(
  req: NextRequest,
  { params }: { params: Promise<{ epicId: string }> }
) {
  const userEmail = await getAuthenticatedUserEmail();
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { epicId: epicAhaId } = await params;
  const body = await req.json().catch(() => null);
  const reviewStatus = body?.review_status as string | undefined;

  if (!reviewStatus || !REVIEW_STATUSES.includes(reviewStatus as ReviewStatus)) {
    return NextResponse.json(
      { error: `review_status must be one of: ${REVIEW_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const adminSupabase = createAdminClient();

  const { data: run, error: findError } = await adminSupabase
    .from('forecast_runs')
    .select('id')
    .eq('epic_aha_id', epicAhaId)
    .eq('is_current', true)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: 'Failed to look up forecast', details: findError.message }, { status: 500 });
  }
  if (!run) {
    return NextResponse.json({ error: 'No current forecast for this epic' }, { status: 404 });
  }

  const { error: updateError } = await adminSupabase
    .from('forecast_runs')
    .update({ review_status: reviewStatus })
    .eq('id', run.id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update status', details: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ review_status: reviewStatus });
}

export const PATCH = withRateLimit(patchHandler, RATE_LIMITS.default);
