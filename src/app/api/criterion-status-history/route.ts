import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { logStatusChange } from '@/lib/db/criterion-status-history';

/**
 * POST /api/criterion-status-history
 * Batch-log status changes from client-side operations (e.g. AI prune).
 * Body: { entries: Array<{ epicCriterionStatusId, epicId, criterionId, oldStatus, newStatus }> }
 */
export async function POST(req: NextRequest) {
  try {
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient();
    const { data: appUser } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await req.json();
    const entries: Array<{
      epicCriterionStatusId: string;
      epicId: string;
      criterionId: string;
      oldStatus: string | null;
      newStatus: string;
    }> = body.entries || [];

    await Promise.all(
      entries.map((e) =>
        logStatusChange({
          epicCriterionStatusId: e.epicCriterionStatusId,
          epicId: e.epicId,
          criterionId: e.criterionId,
          oldStatus: e.oldStatus,
          newStatus: e.newStatus,
          changedBy: appUser.id,
        })
      )
    );

    return NextResponse.json({ logged: entries.length });
  } catch (err: any) {
    console.error('[POST /api/criterion-status-history]', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
