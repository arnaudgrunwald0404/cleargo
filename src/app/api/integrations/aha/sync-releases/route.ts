import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getReleases, getReleaseEpics } from '@/lib/aha/client';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getEffectivePermissionRules } from '@/lib/settings-db';

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

        const rules = await getEffectivePermissionRules();
        const ok = canRolesPerformWithRules((me?.roles as string[]) || [], 'releases.manage', rules);
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

        // Upsert ALL releases with epics into release_schedule table (including those without dates)
        let synced = 0;
        let errors = 0;
        const releasesWithoutDates: Array<{ name: string; id: string }> = [];

        for (const release of releasesWithEpics) {
            try {
                // Use end_date if available, otherwise start_date, otherwise null
                const launchDate = release.end_date || release.start_date || null;

                // Track releases without dates
                if (!launchDate) {
                    releasesWithoutDates.push({
                        name: release.name,
                        id: release.id,
                    });
                    console.warn(`⚠️ Release "${release.name}" has no date in Aha`);
                }

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

        const withoutDatesCount = releasesWithoutDates.length;
        const message = withoutDatesCount > 0
            ? `Synced ${synced} releases (${withoutDatesCount} without dates, ${errors} errors)`
            : `Synced ${synced} releases (${errors} errors)`;

        return NextResponse.json({
            success: true,
            message,
            total_releases: allReleases.length,
            releases_with_epics: releasesWithEpics.length,
            synced,
            releases_without_dates: releasesWithoutDates,
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

