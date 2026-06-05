import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/auth-helpers';
import { getGtmAccessPendingEpics } from '@/lib/services/gtmAccessNudgeService';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const session = await getSession();
    const userEmail = user?.email || session?.email;

    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const viewAsEmailParam = searchParams.get('viewAsEmail');
    let effectiveEmail = userEmail;

    if (viewAsEmailParam?.trim()) {
      if (!isSuperAdmin(userEmail)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const { data: targetUser } = await supabase
        .from('app_user')
        .select('email')
        .ilike('email', viewAsEmailParam.trim())
        .maybeSingle();
      if (!targetUser?.email) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      effectiveEmail = targetUser.email;
    }

    const items = await getGtmAccessPendingEpics(undefined, {
      ownerEmail: effectiveEmail.trim().toLowerCase(),
    });

    return NextResponse.json(items);
  } catch (error: unknown) {
    console.error('gtm-access-pending error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
