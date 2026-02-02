import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/roles';
import {
  assignNudgeToCsm,
  updateNudgeStatus,
} from '@/lib/heart';

interface RouteParams {
  params: Promise<{ nudgeId: string }>;
}

/**
 * PUT /api/csm/nudges/[nudgeId]
 * Update a CSM nudge (assign, mark contacted, resolve, etc.)
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { nudgeId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, status, notes, assignTo } = body;

    let nudge;

    if (action === 'assign') {
      // Assign to a specific CSM (or self if not specified)
      const csmEmail = assignTo || user.email;
      nudge = await assignNudgeToCsm(nudgeId, csmEmail);
    } else if (action === 'update_status' && status) {
      // Update status with optional notes
      nudge = await updateNudgeStatus(nudgeId, status, notes);
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "assign" or "update_status"' },
        { status: 400 }
      );
    }

    return NextResponse.json({ nudge });
  } catch (error: any) {
    console.error('Error updating CSM nudge:', error);
    return NextResponse.json(
      { error: 'Failed to update nudge', details: error.message },
      { status: 500 }
    );
  }
}
