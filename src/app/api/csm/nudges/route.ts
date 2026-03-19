import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getPendingCsmNudges,
  getDashboardSummary,
} from '@/lib/heart';
import { canRolesPerform } from '@/lib/permissions';

/**
 * GET /api/csm/nudges
 * List CSM nudges - CSMs see their assigned nudges, admins see all
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has access (CSMs can see their own, admins see all)
    const { data: meData } = await supabase.from('app_user').select('roles').eq('email', user.email).maybeSingle();
    const isAdmin = canRolesPerform((meData?.roles as string[]) || [], 'settings.update');

    // For now, allow any authenticated user to see nudges
    // In production, you'd want to check if user is a CSM
    const nudges = await getPendingCsmNudges(isAdmin ? undefined : user.email);

    return NextResponse.json({ 
      nudges,
      count: nudges.length,
    });
  } catch (error: any) {
    console.error('Error listing CSM nudges:', error);
    return NextResponse.json(
      { error: 'Failed to list nudges', details: error.message },
      { status: 500 }
    );
  }
}
