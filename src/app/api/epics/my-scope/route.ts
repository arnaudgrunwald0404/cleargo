import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail, getAuthenticatedUserWithRoles } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const userEmail = await getAuthenticatedUserEmail();
    
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user with roles to check if they're a super admin/CPO
    const appUser = await getAuthenticatedUserWithRoles();
    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const roles = (appUser.roles as string[] | null) || [];
    const isSuperAdmin = roles.some(r => 
      r.toUpperCase() === 'SUPERADMIN' || 
      r.toUpperCase() === 'CPO' || 
      r.toUpperCase() === 'PRODUCT_OPS'
    );

    // If super admin/CPO, return all epics
    if (isSuperAdmin) {
      // Use direct PostgREST request like getEpics() does for consistency
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      
      if (serviceRoleKey && supabaseUrl) {
        try {
          const response = await fetch(
            `${supabaseUrl}/rest/v1/epic?select=*&order=created_at.desc`,
            {
              method: 'GET',
              headers: {
                'apikey': serviceRoleKey,
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
              }
            }
          );

          if (response.ok) {
            const directData = await response.json();
            if (directData && Array.isArray(directData)) {
              return NextResponse.json(directData);
            }
          }
        } catch (directError: any) {
          console.warn('Direct PostgREST request error:', directError?.message);
        }
      }

      // Fallback to Supabase client
      const { data: allEpics, error: epicsError } = await supabase
        .from('epic')
        .select('*')
        .order('created_at', { ascending: false });

      if (epicsError) {
        console.error('Error fetching all epics:', epicsError);
        return NextResponse.json({ error: 'Failed to fetch epics' }, { status: 500 });
      }

      return NextResponse.json(allEpics || []);
    }

    // Regular users: filter by decision owner or watch list

    // Get epics where user is decision_owner_id in epic_criterion_status
    const { data: epicsFromCriteria, error: criteriaError } = await supabase
      .from('epic_criterion_status')
      .select('epic_id')
      .eq('decision_owner_id', appUser.id)
      .not('epic_id', 'is', null);

    if (criteriaError) {
      console.error('Error fetching epics from criteria:', criteriaError);
    }

    // Get epics from watch list
    const { data: watchedEpics, error: watchError } = await supabase
      .from('epic_watches')
      .select('epic_id')
      .eq('user_id', appUser.id);

    if (watchError) {
      console.error('Error fetching watched epics:', watchError);
    }

    // Combine epic IDs (unique)
    const epicIds = new Set<string>();
    epicsFromCriteria?.forEach(item => {
      if (item.epic_id) epicIds.add(item.epic_id);
    });
    watchedEpics?.forEach(item => {
      if (item.epic_id) epicIds.add(item.epic_id);
    });

    if (epicIds.size === 0) {
      return NextResponse.json([]);
    }

    // Fetch full epic data for these IDs
    // Use direct PostgREST request like getEpics() does for consistency
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    if (serviceRoleKey && supabaseUrl) {
      try {
        const epicIdsArray = Array.from(epicIds);
        // PostgREST in() filter
        const idsFilter = epicIdsArray.map(id => `"${id}"`).join(',');
        const response = await fetch(
          `${supabaseUrl}/rest/v1/epic?select=*&id=in.(${idsFilter})&order=created_at.desc`,
          {
            method: 'GET',
            headers: {
              'apikey': serviceRoleKey,
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            }
          }
        );

        if (response.ok) {
          const directData = await response.json();
          if (directData && Array.isArray(directData)) {
            return NextResponse.json(directData);
          }
        }
      } catch (directError: any) {
        console.warn('Direct PostgREST request error:', directError?.message);
      }
    }

    // Fallback to Supabase client if direct request fails
    const { data: epics, error: epicsError } = await supabase
      .from('epic')
      .select('*')
      .in('id', Array.from(epicIds))
      .order('created_at', { ascending: false });

    if (epicsError) {
      console.error('Error fetching epics:', epicsError);
      return NextResponse.json({ error: 'Failed to fetch epics' }, { status: 500 });
    }

    return NextResponse.json(epics || []);
  } catch (error: any) {
    console.error('Error fetching my-scope epics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch my-scope epics', details: error.message },
      { status: 500 }
    );
  }
}

