import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import {
  calculatePMTimelinessIndex,
  getPMTimelinessByPM
} from '@/lib/services/analyticsService';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getEffectivePermissionRules } from '@/lib/settings-db';

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedUserEmail();

    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data: appUser } = await supabase
      .from('app_user')
      .select('roles')
      .eq('email', email)
      .single();
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules((appUser?.roles as string[]) || [], 'analytics.read', rules)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const pmEmail = searchParams.get('pm_email');
    
    // If pm_email is provided, return index for that PM only
    if (pmEmail) {
      const filters = {
        tier: searchParams.get('tier') || undefined,
        pod: searchParams.get('pod') || undefined,
        dateRangeStart: searchParams.get('date_range_start') || undefined,
        dateRangeEnd: searchParams.get('date_range_end') || undefined,
      };

      const index = await calculatePMTimelinessIndex(pmEmail, filters);
      return NextResponse.json({ pmEmail, index });
    }

    // Otherwise return all PMs
    const filters = {
      tier: searchParams.get('tier') || undefined,
      pod: searchParams.get('pod') || undefined,
      dateRangeStart: searchParams.get('date_range_start') || undefined,
      dateRangeEnd: searchParams.get('date_range_end') || undefined,
    };

    const result = await getPMTimelinessByPM(filters);
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error fetching PM timeliness data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch PM timeliness data', details: error.message },
      { status: 500 }
    );
  }
}
