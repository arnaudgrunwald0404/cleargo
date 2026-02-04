import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getReleases } from '@/lib/aha/client';
import { resolveRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check permissions - only SUPERADMIN, CPO, PRODUCT_OPS, PRODUCT
        const role = await resolveRole(user.email);
        const allowedRoles = ['SUPERADMIN', 'CPO', 'PRODUCT_OPS', 'PRODUCT'];
        if (!allowedRoles.includes(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        console.log('🔄 Fetching releases from Aha API...');

        // Fetch all releases from Aha (paginated)
        let allReleases: any[] = [];
        let page = 1;
        const perPage = 50;
        let hasMore = true;

        while (hasMore) {
            const response = await getReleases({ per_page: perPage, page });
            const releases = response.releases || [];
            allReleases = allReleases.concat(releases);
            
            hasMore = releases.length === perPage;
            page++;
        }

        console.log(`📦 Found ${allReleases.length} total releases in Aha`);

        // Step 1: First check release_schedule.launch_date from database
        const { data: dbReleases, error: dbError } = await supabase
            .from('release_schedule')
            .select('release_name, launch_date');
        
        const dbReleaseDateMap = new Map<string, string>();
        if (dbReleases) {
            dbReleases.forEach((r: any) => {
                if (r.release_name && r.launch_date) {
                    dbReleaseDateMap.set(r.release_name, r.launch_date);
                }
            });
        }
        console.log(`📅 Found ${dbReleaseDateMap.size} releases with dates in database`);

        // Step 2: Determine launch_date for each release
        // Priority: 1) database launch_date, 2) Aha API (end_date || start_date)
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to start of day for comparison

        const releasesData = allReleases
            .map(release => {
                // First priority: check database launch_date
                let launch_date = dbReleaseDateMap.get(release.name) || null;
                let dateSource = launch_date ? 'database' : null;
                
                // Second priority: check Aha API (end_date || start_date)
                if (!launch_date) {
                    launch_date = release.end_date || release.start_date || null;
                    dateSource = launch_date ? (release.end_date ? 'aha_end_date' : 'aha_start_date') : null;
                }
                
                if (launch_date && dateSource) {
                    console.log(`📅 Release "${release.name}": launch_date=${launch_date} (from ${dateSource})`);
                } else {
                    console.log(`⚠️ Release "${release.name}": No launch_date found (database or Aha API)`);
                }
                
                return {
                    id: release.id,
                    name: release.name,
                    start_date: release.start_date,
                    end_date: release.end_date,
                    launch_date, // The determined launch_date
                };
            })
            .filter(release => {
                // Step 3: Filter releases where launch_date >= today
                // Also include releases without dates (they can still be synced)
                if (!release.launch_date) {
                    console.log(`⚠️ Release "${release.name}" has no launch_date, but including anyway (can still be synced)`);
                    return true; // Include releases without dates - they can still be synced
                }
                
                try {
                    const launchDateObj = new Date(release.launch_date);
                    if (isNaN(launchDateObj.getTime())) {
                        console.log(`⚠️ Release "${release.name}" has invalid launch_date format: ${release.launch_date}`);
                        return true; // Include anyway if date is invalid
                    }
                    
                    launchDateObj.setHours(0, 0, 0, 0);
                    const isIncluded = launchDateObj >= today; // launch_date >= today
                    console.log(`📅 Release "${release.name}": launch_date=${release.launch_date} (${launchDateObj.toISOString().split('T')[0]}) >= today (${today.toISOString().split('T')[0]}) = ${isIncluded ? '✅ INCLUDE' : '❌ EXCLUDE'}`);
                    return isIncluded;
                } catch (error) {
                    console.error(`❌ Error parsing launch_date for release "${release.name}": ${release.launch_date}`, error);
                    return true; // Include anyway if parsing fails
                }
            });

        console.log(`📅 Filtered to ${releasesData.length} releases with launch_date >= today (from ${allReleases.length} total)`);
        
        // Log which releases were included/excluded
        if (releasesData.length === 0 && allReleases.length > 0) {
            console.warn(`⚠️ No releases passed the filter! This might indicate a date parsing issue.`);
        }

        // Step 4: Sort releases alphabetically by name
        releasesData.sort((a, b) => {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
        
        // Remove launch_date from response (only return start_date and end_date for compatibility)
        const releasesResponse = releasesData.map(({ launch_date, ...rest }) => rest);

        return NextResponse.json({
            success: true,
            releases: releasesResponse,
            total: releasesResponse.length,
        });
    } catch (error: any) {
        console.error('Error fetching releases:', error);
        return NextResponse.json(
            { error: 'Failed to fetch releases', details: error.message },
            { status: 500 }
        );
    }
}
