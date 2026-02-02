import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/roles';
import {
  getPendingCsmNudges,
  getDashboardSummary,
} from '@/lib/heart';

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

    const role = await resolveRole(user.email);
    
    // Check if user has access (CSMs can see their own, admins see all)
    const isAdmin = role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO';
    
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
