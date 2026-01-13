import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';

async function getHandler(req: NextRequest) {
  try {
    const supabase = createClient();
    const userEmail = await getAuthenticatedUserEmail();
    
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get epic_ids from query parameters
    const searchParams = req.nextUrl.searchParams;
    const epicIdsParam = searchParams.get('epic_ids');
    
    if (!epicIdsParam) {
      return NextResponse.json({ error: 'epic_ids parameter is required' }, { status: 400 });
    }

    // Parse epic IDs (comma-separated)
    const epicIds = epicIdsParam.split(',').map(id => id.trim()).filter(id => id.length > 0);
    
    if (epicIds.length === 0) {
      return NextResponse.json({});
    }

    // Get user_id from app_user table (single query)
    const { data: appUser, error: userError } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', userEmail.toLowerCase())
      .single();

    if (userError || !appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch all watch statuses in a single query using IN clause
    const { data: watches, error: watchError } = await supabase
      .from('epic_watches')
      .select('epic_id')
      .eq('user_id', appUser.id)
      .in('epic_id', epicIds);

    if (watchError) {
      console.error('Error fetching watch statuses:', watchError);
      return NextResponse.json({ error: 'Failed to fetch watch statuses' }, { status: 500 });
    }

    // Build a map of epic_id -> isWatching
    const watchSet = new Set<string>();
    watches?.forEach(watch => {
      if (watch.epic_id) {
        watchSet.add(watch.epic_id);
      }
    });

    // Return object with all epic IDs (including false for unwatched)
    const result: Record<string, boolean> = {};
    epicIds.forEach(epicId => {
      result[epicId] = watchSet.has(epicId);
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error fetching batch watch statuses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch watch statuses', details: error.message },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);

