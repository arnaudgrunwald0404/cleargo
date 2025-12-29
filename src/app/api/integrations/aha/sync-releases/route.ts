import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getReleases, getReleaseEpics } from '@/lib/aha/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check permissions
        const { data: me } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();

        const { canRolesPerform } = await import('@/lib/permissions');
        const ok = await canRolesPerform((me?.roles as string[]) || [], 'releases.manage');
        if (!ok) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        console.log('🔄 Starting release sync from Aha API...');

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

        // Filter releases that contain epics
        const releasesWithEpics: Array<{ id: string; name: string; start_date?: string; end_date?: string }> = [];
        
        for (const release of allReleases) {
            try {
                // Check if release has epics (just check first page to see if any exist)
                const epicsResponse = await getReleaseEpics(release.id, { per_page: 1, page: 1 });
                const epics = epicsResponse.epics || [];
                
                if (epics.length > 0) {
                    releasesWithEpics.push({
                        id: release.id,
                        name: release.name,
                        start_date: release.start_date,
                        end_date: release.end_date,
                    });
                }
            } catch (error) {
                console.warn(`Failed to check epics for release ${release.name}:`, error);
                // Continue with other releases
            }
        }

        console.log(`✅ Found ${releasesWithEpics.length} releases with epics`);

        // Filter to only include releases within the next 6 months
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
        
        const sixMonthsFromNow = new Date();
        sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
        sixMonthsFromNow.setHours(23, 59, 59, 999); // End of day
        
        const releasesWithinSixMonths = releasesWithEpics.filter((release) => {
            const launchDate = release.end_date || release.start_date;
            if (!launchDate) {
                // Exclude releases without dates since we can't verify they're within 6 months
                return false;
            }
            const releaseDate = new Date(launchDate);
            releaseDate.setHours(0, 0, 0, 0);
            return releaseDate >= today && releaseDate <= sixMonthsFromNow;
        });

        console.log(`📅 Filtered to ${releasesWithinSixMonths.length} releases within next 6 months (excluded ${releasesWithEpics.length - releasesWithinSixMonths.length} releases)`);

        // Upsert releases into release_schedule table
        let synced = 0;
        let errors = 0;

        for (const release of releasesWithinSixMonths) {
            try {
                // Use end_date if available, otherwise start_date, otherwise null
                const launchDate = release.end_date || release.start_date || null;

                const { error } = await supabase
                    .from('release_schedule')
                    .upsert(
                        {
                            release_name: release.name,
                            launch_date: launchDate,
                            updated_at: new Date().toISOString(),
                        },
                        {
                            onConflict: 'release_name',
                        }
                    );

                if (error) {
                    console.error(`Error syncing release ${release.name}:`, error);
                    errors++;
                } else {
                    synced++;
                }
            } catch (error) {
                console.error(`Error processing release ${release.name}:`, error);
                errors++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `Synced ${synced} releases (${errors} errors)`,
            total_releases: allReleases.length,
            releases_with_epics: releasesWithEpics.length,
            releases_within_six_months: releasesWithinSixMonths.length,
            synced,
            errors,
        });
    } catch (error: any) {
        console.error('Error syncing releases:', error);
        return NextResponse.json(
            { error: 'Failed to sync releases', details: error.message },
            { status: 500 }
        );
    }
}

